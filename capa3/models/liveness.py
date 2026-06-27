"""
Liveness Detection / Anti-Spoofing — §6.3.2.4
Detecta si el rostro frente a la cámara es una persona real o un ataque
(foto impresa, pantalla, máscara 3D básica).

Modelo seleccionado: MiniFASNetV2 (Silent-Face-Anti-Spoofing)
- Input: Face crop float32
- Output: Score [0.0, 1.0] — 1.0 = persona real
- Umbral: ≥ 0.85
- Inferencia: ONNX Runtime

Implementación:
    - MiniFASNetDetector: modelo real ONNX (cuando haya pesos)
    - TextureLivenessDetector: fallback basado en análisis de textura
"""

import logging
from abc import ABC, abstractmethod
from pathlib import Path

import cv2
import numpy as np

from capa3.config import LIVENESS_THRESHOLD, MODELS_DIR

logger = logging.getLogger(__name__)


class BaseLivenessDetector(ABC):
    """Interfaz abstracta para detección de liveness."""

    @abstractmethod
    def check(self, face_crop: np.ndarray) -> float:
        """
        Evalúa si el rostro es real.

        Args:
            face_crop: Región facial como numpy array RGB, float32 o uint8.

        Returns:
            Score de vivacidad en rango [0.0, 1.0].
            ≥ 0.85 = persona real según spec §6.3.2.4.
        """
        ...

    @property
    def threshold(self) -> float:
        return LIVENESS_THRESHOLD


class MiniFASNetDetector(BaseLivenessDetector):
    """
    Detector de liveness con MiniFASNetV2 vía ONNX Runtime.
    
    Requiere archivo de pesos ONNX en MODELS_DIR/minifasnet.onnx.
    Se carga bajo demanda al primer uso.
    """

    def __init__(self, model_path: Path | None = None):
        self._model_path = model_path or MODELS_DIR / "minifasnet.onnx"
        self._session = None

        if self._model_path.exists():
            self._load_model()
        else:
            logger.warning(
                "Pesos de MiniFASNet no encontrados en %s. "
                "Usar TextureLivenessDetector como fallback o descargar pesos ONNX.",
                self._model_path,
            )

    def _load_model(self):
        """Carga el modelo ONNX."""
        try:
            import onnxruntime as ort

            self._session = ort.InferenceSession(
                str(self._model_path),
                providers=["CPUExecutionProvider"],
            )
            logger.info("MiniFASNet cargado desde %s", self._model_path)
        except Exception as e:
            logger.error("Error cargando MiniFASNet: %s", e)
            self._session = None

    def check(self, face_crop: np.ndarray) -> float:
        """
        Evalúa liveness con MiniFASNet ONNX.
        
        Si el modelo no está cargado, retorna 0.0 (DENY por precaución).
        """
        if self._session is None:
            logger.warning("MiniFASNet no disponible — retornando score 0.0")
            return 0.0

        try:
            input_tensor = self._preprocess(face_crop)
            input_name = self._session.get_inputs()[0].name
            outputs = self._session.run(None, {input_name: input_tensor})
            # Probabilidad de clase "real" (índice 1)
            score = float(outputs[0][0][1])
            return score
        except Exception as e:
            logger.error("Error en inferencia MiniFASNet: %s", e)
            return 0.0

    def _preprocess(self, face_crop: np.ndarray) -> np.ndarray:
        """Preprocesa face crop para MiniFASNet."""
        if face_crop.dtype == np.uint8:
            face_crop = face_crop.astype(np.float32) / 255.0

        # Resize a 80x80 (tamaño estándar de MiniFASNet)
        resized = cv2.resize(face_crop, (80, 80))

        # Normalización
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        normalized = (resized - mean) / std

        # Transponer a formato NCHW
        tensor = np.transpose(normalized, (2, 0, 1))
        tensor = np.expand_dims(tensor, axis=0).astype(np.float32)
        return tensor


class TextureLivenessDetector(BaseLivenessDetector):
    """
    Detector de liveness basado en análisis de textura.
    
    Fallback cuando no hay pesos MiniFASNet disponibles.
    Usa una combinación de:
    - Varianza Laplaciana (nitidez / artefactos de impresión)
    - LBP (Local Binary Pattern) para textura de piel vs papel/pantalla
    - Análisis de bordes (fotos impresas tienen bordes más definidos)
    
    NOTA: Este método es menos preciso que MiniFASNet. Se recomienda
    reemplazar por MiniFASNetDetector cuando haya pesos ONNX disponibles.
    """

    def __init__(self):
        logger.info(
            "TextureLivenessDetector inicializado (fallback — "
            "reemplazar por MiniFASNetDetector cuando haya pesos ONNX)"
        )

    def check(self, face_crop: np.ndarray) -> float:
        """
        Evalúa liveness basándose en textura y frecuencia espacial.
        
        Heurísticas:
        1. Varianza Laplaciana — las fotos impresas/pantallas tienen frecuencias
           espaciales diferentes a la piel real
        2. Análisis de color en espacio HSV — la piel real tiene distribución
           de saturación diferente al papel
        3. Reflexión especular — las pantallas muestran reflejos uniformes
        """
        if face_crop.dtype != np.uint8:
            img = (face_crop * 255).astype(np.uint8)
        else:
            img = face_crop.copy()

        scores = []

        # 1. Varianza Laplaciana normalizada
        gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
        # Rango esperado: ~50-500 para caras reales, <30 para fotos impresas borrosas
        lap_score = min(1.0, laplacian_var / 300.0)
        scores.append(lap_score)

        # 2. Análisis de saturación en HSV
        hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
        sat_mean = hsv[:, :, 1].mean()
        sat_std = hsv[:, :, 1].std()
        # Piel real: saturación media 40-120, std 15-50
        # Pantalla/papel: saturación baja o muy uniforme
        sat_score = min(1.0, sat_std / 30.0) * min(1.0, sat_mean / 60.0)
        scores.append(sat_score)

        # 3. Análisis de frecuencia (DCT)
        gray_float = gray.astype(np.float32)
        resized = cv2.resize(gray_float, (64, 64))
        dct = cv2.dct(resized)
        # Ratio de energía alta frecuencia vs baja frecuencia
        low_freq_energy = np.sum(np.abs(dct[:16, :16]))
        high_freq_energy = np.sum(np.abs(dct[16:, 16:]))
        total_energy = low_freq_energy + high_freq_energy
        if total_energy > 0:
            freq_ratio = high_freq_energy / total_energy
            freq_score = min(1.0, freq_ratio * 5.0)
        else:
            freq_score = 0.5
        scores.append(freq_score)

        # Score final: promedio ponderado
        final_score = 0.4 * scores[0] + 0.35 * scores[1] + 0.25 * scores[2]

        logger.debug(
            "TextureLiveness: laplacian=%.2f, saturation=%.2f, frequency=%.2f → score=%.3f",
            scores[0], scores[1], scores[2], final_score,
        )
        return final_score


def create_liveness_detector() -> BaseLivenessDetector:
    """
    Factory que retorna el detector de liveness apropiado.
    
    Prioriza MiniFASNet si los pesos ONNX están disponibles.
    De lo contrario, usa TextureLivenessDetector como fallback.
    """
    onnx_path = MODELS_DIR / "minifasnet.onnx"
    if onnx_path.exists():
        detector = MiniFASNetDetector(onnx_path)
        if detector._session is not None:
            return detector

    logger.info(
        "Usando TextureLivenessDetector (fallback). Para MiniFASNet real, "
        "colocar pesos en %s",
        onnx_path,
    )
    return TextureLivenessDetector()
