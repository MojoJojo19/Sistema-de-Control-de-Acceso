"""
Verificación de Calidad del Frame — §6.3.1.2 Paso 5

Evalúa si el frame capturado tiene la calidad suficiente para
extracción de embedding facial confiable.

Criterios (§6.3.3.1 Paso 4):
    - Resolución mínima 96×96 px dentro del bounding box
    - Varianza Laplaciana ≥ umbral (nitidez)
    - Reintentos: máx 3 veces desde ESP32-S3
"""

import logging
from dataclasses import dataclass

import cv2
import numpy as np

from capa3.config import QUALITY_LAPLACIAN_THRESHOLD, QUALITY_MIN_RESOLUTION

logger = logging.getLogger(__name__)


@dataclass
class QualityResult:
    """Resultado de la verificación de calidad."""
    passed: bool
    bbox_width: int
    bbox_height: int
    laplacian_variance: float
    rejection_reason: str | None


def check_quality(
    image_rgb: np.ndarray,
    bbox: np.ndarray | None = None,
) -> QualityResult:
    """
    Verifica la calidad del frame para reconocimiento facial.

    Args:
        image_rgb: Imagen RGB (H, W, 3), uint8.
        bbox: Bounding box [x1, y1, x2, y2] del MTCNN.
              Si es None, evalúa la imagen completa.

    Returns:
        QualityResult con métricas de calidad y pass/fail.
    """
    if bbox is not None:
        x1, y1, x2, y2 = [int(v) for v in bbox]
        # Clampar a los bordes de la imagen
        h, w = image_rgb.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        face_region = image_rgb[y1:y2, x1:x2]
        bbox_width = x2 - x1
        bbox_height = y2 - y1
    else:
        face_region = image_rgb
        bbox_height, bbox_width = image_rgb.shape[:2]

    # Verificación 1: Resolución mínima — §6.3.3.1 Paso 4
    if bbox_width < QUALITY_MIN_RESOLUTION or bbox_height < QUALITY_MIN_RESOLUTION:
        reason = (
            f"Resolución insuficiente: {bbox_width}×{bbox_height} px "
            f"(mín. {QUALITY_MIN_RESOLUTION}×{QUALITY_MIN_RESOLUTION})"
        )
        logger.debug("Calidad: %s", reason)
        return QualityResult(
            passed=False,
            bbox_width=bbox_width,
            bbox_height=bbox_height,
            laplacian_variance=0.0,
            rejection_reason=reason,
        )

    # Verificación 2: Nitidez (varianza Laplaciana)
    gray = cv2.cvtColor(face_region, cv2.COLOR_RGB2GRAY)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    laplacian_var = float(laplacian.var())

    if laplacian_var < QUALITY_LAPLACIAN_THRESHOLD:
        reason = (
            f"Imagen borrosa: varianza Laplaciana {laplacian_var:.1f} "
            f"< umbral {QUALITY_LAPLACIAN_THRESHOLD}"
        )
        logger.debug("Calidad: %s", reason)
        return QualityResult(
            passed=False,
            bbox_width=bbox_width,
            bbox_height=bbox_height,
            laplacian_variance=laplacian_var,
            rejection_reason=reason,
        )

    logger.debug(
        "Calidad OK: %dx%d px, laplacian=%.1f",
        bbox_width,
        bbox_height,
        laplacian_var,
    )
    return QualityResult(
        passed=True,
        bbox_width=bbox_width,
        bbox_height=bbox_height,
        laplacian_variance=laplacian_var,
        rejection_reason=None,
    )
