"""
MTCNN — Detección facial + Alineación — §6.3.2.2
Multi-task Cascaded Convolutional Networks para detección de rostros.

Paso 4 del pipeline (después de FaceMesh y Liveness):
    - Detecta bounding box del rostro
    - Extrae landmarks de ojos para alineación
    - Genera face crop de 160×160 px

Configuración del spec:
    image_size=160
    margin=20
    min_face_size=80
    thresholds=[0.6, 0.7, 0.9]
    factor=0.709
    keep_all=False
    device='cpu'
"""

import logging
from dataclasses import dataclass

import numpy as np
import torch
from facenet_pytorch import MTCNN
from PIL import Image

from capa3.config import (
    MTCNN_FACTOR,
    MTCNN_IMAGE_SIZE,
    MTCNN_MARGIN,
    MTCNN_MIN_CONFIDENCE,
    MTCNN_MIN_FACE_SIZE,
    MTCNN_THRESHOLDS,
)

logger = logging.getLogger(__name__)


@dataclass
class DetectionResult:
    """Resultado de la detección facial."""
    detected: bool
    face_crop: torch.Tensor | None  # Tensor (3, 160, 160) float32
    confidence: float
    bbox: np.ndarray | None  # [x1, y1, x2, y2]
    landmarks: np.ndarray | None  # 5 landmarks (ojos, nariz, boca)
    rejection_reason: str | None


class FaceDetector:
    """
    Detector facial MTCNN exactamente como el spec §6.3.2.2.
    
    Produce un face crop alineado de 160×160 px listo para
    InceptionResnetV1 (paso 6 del pipeline).
    """

    def __init__(self):
        self._mtcnn = MTCNN(
            image_size=MTCNN_IMAGE_SIZE,
            margin=MTCNN_MARGIN,
            min_face_size=MTCNN_MIN_FACE_SIZE,
            thresholds=MTCNN_THRESHOLDS,
            factor=MTCNN_FACTOR,
            keep_all=False,
            device="cpu",
        )
        logger.info(
            "MTCNN inicializado: image_size=%d, margin=%d, min_face=%d, "
            "thresholds=%s, min_confidence=%.2f",
            MTCNN_IMAGE_SIZE,
            MTCNN_MARGIN,
            MTCNN_MIN_FACE_SIZE,
            MTCNN_THRESHOLDS,
            MTCNN_MIN_CONFIDENCE,
        )

    def detect(self, image_rgb: np.ndarray) -> DetectionResult:
        """
        Detecta un rostro en la imagen y retorna un crop alineado.

        Args:
            image_rgb: Imagen RGB como numpy array (H, W, 3), uint8.

        Returns:
            DetectionResult con face crop tensor, confianza, bbox, y landmarks.
        """
        pil_image = Image.fromarray(image_rgb)

        # Detectar con MTCNN
        boxes, probs, landmarks = self._mtcnn.detect(pil_image, landmarks=True)

        if boxes is None or len(boxes) == 0:
            logger.debug("MTCNN: no se detectó rostro")
            return DetectionResult(
                detected=False,
                face_crop=None,
                confidence=0.0,
                bbox=None,
                landmarks=None,
                rejection_reason="MTCNN no detectó rostro en el frame",
            )

        # Tomar el rostro con mayor confianza
        confidence = float(probs[0])
        bbox = boxes[0]
        face_landmarks = landmarks[0] if landmarks is not None else None

        # Verificar umbral de confianza — §6.3.3.1 Paso 3
        if confidence < MTCNN_MIN_CONFIDENCE:
            logger.debug(
                "MTCNN: confianza %.3f < umbral %.2f",
                confidence,
                MTCNN_MIN_CONFIDENCE,
            )
            return DetectionResult(
                detected=False,
                face_crop=None,
                confidence=confidence,
                bbox=bbox,
                landmarks=face_landmarks,
                rejection_reason=(
                    f"Confianza MTCNN {confidence:.3f} < umbral {MTCNN_MIN_CONFIDENCE}"
                ),
            )

        # Extraer face crop alineado (160×160 tensor)
        face_crop = self._mtcnn(pil_image)

        if face_crop is None:
            logger.debug("MTCNN: face crop fallido")
            return DetectionResult(
                detected=False,
                face_crop=None,
                confidence=confidence,
                bbox=bbox,
                landmarks=face_landmarks,
                rejection_reason="MTCNN no pudo extraer face crop",
            )

        logger.debug(
            "MTCNN: detectado con confianza=%.3f, bbox=%s",
            confidence,
            bbox.tolist(),
        )
        return DetectionResult(
            detected=True,
            face_crop=face_crop,
            confidence=confidence,
            bbox=bbox,
            landmarks=face_landmarks,
            rejection_reason=None,
        )

    def get_bbox_dimensions(self, bbox: np.ndarray) -> tuple[int, int]:
        """Retorna (width, height) del bounding box."""
        x1, y1, x2, y2 = bbox
        return int(x2 - x1), int(y2 - y1)
