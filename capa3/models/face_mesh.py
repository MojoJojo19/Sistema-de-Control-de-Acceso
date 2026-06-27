"""
MediaPipe FaceMesh (Tasks API) — §6.3.2.2
Detección de 468 landmarks faciales 3D con validación de geometría.

Rol en el pipeline (Paso 2):
    - Extrae 468 landmarks 3D normalizados
    - Valida geometría: simetría izquierda-derecha
    - Verifica presencia de: ojos, nariz, boca, contorno
    - Estimación de pose: rechaza si |yaw| > 30°

Configuración del spec:
    max_num_faces=1
    min_detection_confidence=0.90
    min_tracking_confidence=0.85
"""

import logging
import math
from dataclasses import dataclass

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from capa3.config import (
    FACEMESH_MAX_YAW_DEGREES,
    FACEMESH_MIN_DETECTION_CONFIDENCE,
    FACEMESH_MIN_TRACKING_CONFIDENCE,
    MODELS_DIR,
)

logger = logging.getLogger(__name__)

# Índices clave de MediaPipe FaceMesh
NOSE_TIP = 1
CHIN = 152
LEFT_EYE_OUTER = 33
RIGHT_EYE_OUTER = 263
LEFT_MOUTH = 61
RIGHT_MOUTH = 291
FOREHEAD = 10

LEFT_EYE_LANDMARKS = [33, 133, 160, 144, 145, 153]
RIGHT_EYE_LANDMARKS = [263, 362, 387, 373, 374, 380]
NOSE_LANDMARKS = [1, 2, 98, 327]
MOUTH_LANDMARKS = [61, 291, 13, 14, 78, 308]


@dataclass
class FaceMeshResult:
    """Resultado del análisis de FaceMesh."""
    detected: bool
    landmarks: np.ndarray | None  # (468, 3)
    yaw_degrees: float
    pitch_degrees: float
    roll_degrees: float
    geometry_valid: bool
    rejection_reason: str | None


class FaceMeshAnalyzer:
    """
    Analizador de malla facial usando la moderna MediaPipe Tasks API.
    """

    def __init__(self):
        model_path = MODELS_DIR / "face_landmarker.task"
        if not model_path.exists():
            raise FileNotFoundError(f"Modelo FaceLandmarker no encontrado en {model_path}")

        base_options = python.BaseOptions(model_asset_path=str(model_path))
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=True,
            num_faces=1,
            min_face_detection_confidence=FACEMESH_MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=FACEMESH_MIN_TRACKING_CONFIDENCE,
        )
        self._detector = vision.FaceLandmarker.create_from_options(options)

        logger.info(
            "FaceMesh (Tasks API) inicializado: detection_conf=%.2f, max_yaw=%d°",
            FACEMESH_MIN_DETECTION_CONFIDENCE,
            FACEMESH_MAX_YAW_DEGREES,
        )

    def analyze(self, image_rgb: np.ndarray) -> FaceMeshResult:
        """Analiza un frame RGB."""
        # Convertir a imagen de MediaPipe
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=image_rgb)
        
        # Inferencia
        results = self._detector.detect(mp_image)

        if not results.face_landmarks:
            logger.debug("FaceMesh: no se detectó rostro")
            return FaceMeshResult(
                detected=False,
                landmarks=None,
                yaw_degrees=0.0,
                pitch_degrees=0.0,
                roll_degrees=0.0,
                geometry_valid=False,
                rejection_reason="No se detectaron landmarks faciales",
            )

        face_landmarks = results.face_landmarks[0]
        h, w, _ = image_rgb.shape

        # Extraer landmarks a numpy (x, y, z escalados a píxeles/proporción)
        landmarks = np.array(
            [(lm.x * w, lm.y * h, lm.z * w) for lm in face_landmarks],
            dtype=np.float32,
        )

        yaw, pitch, roll = self._estimate_pose(landmarks, w, h)
        geometry_valid, rejection_reason = self._validate_geometry(landmarks, yaw, pitch)

        return FaceMeshResult(
            detected=True,
            landmarks=landmarks,
            yaw_degrees=yaw,
            pitch_degrees=pitch,
            roll_degrees=roll,
            geometry_valid=geometry_valid,
            rejection_reason=rejection_reason,
        )

    def _estimate_pose(self, landmarks: np.ndarray, img_w: int, img_h: int) -> tuple[float, float, float]:
        """Estima yaw, pitch, roll usando la geometría del rostro."""
        nose = landmarks[NOSE_TIP]
        left_eye = landmarks[LEFT_EYE_OUTER]
        right_eye = landmarks[RIGHT_EYE_OUTER]
        chin = landmarks[CHIN]
        forehead = landmarks[FOREHEAD]

        eye_center_x = (left_eye[0] + right_eye[0]) / 2
        eye_distance = abs(right_eye[0] - left_eye[0])
        
        if eye_distance > 0:
            nose_offset = (nose[0] - eye_center_x) / eye_distance
            yaw = math.degrees(math.atan2(nose_offset, 1.0)) * 2
        else:
            yaw = 0.0

        face_height = abs(chin[1] - forehead[1])
        if face_height > 0:
            nose_vertical_ratio = (nose[1] - forehead[1]) / face_height
            pitch = (nose_vertical_ratio - 0.5) * 60
        else:
            pitch = 0.0

        dy = right_eye[1] - left_eye[1]
        dx = right_eye[0] - left_eye[0]
        roll = math.degrees(math.atan2(dy, dx))

        return yaw, pitch, roll

    def _validate_geometry(self, landmarks: np.ndarray, yaw: float, pitch: float) -> tuple[bool, str | None]:
        if abs(yaw) > FACEMESH_MAX_YAW_DEGREES:
            return False, f"Yaw excesivo: {yaw:.1f}° (máx ±{FACEMESH_MAX_YAW_DEGREES}°)"

        for name, indices in [
            ("ojos izquierdo", LEFT_EYE_LANDMARKS),
            ("ojos derecho", RIGHT_EYE_LANDMARKS),
            ("nariz", NOSE_LANDMARKS),
            ("boca", MOUTH_LANDMARKS),
        ]:
            region = landmarks[indices]
            spread = np.std(region[:, :2])
            if spread < 1.0:
                return False, f"Landmarks de {name} colapsados (spread={spread:.2f})"

        nose_x = landmarks[NOSE_TIP][0]
        left_dist = abs(landmarks[LEFT_EYE_OUTER][0] - nose_x)
        right_dist = abs(landmarks[RIGHT_EYE_OUTER][0] - nose_x)
        if left_dist > 0 and right_dist > 0:
            symmetry_ratio = min(left_dist, right_dist) / max(left_dist, right_dist)
            if symmetry_ratio < 0.4:
                return False, f"Asimetría facial excesiva (ratio={symmetry_ratio:.2f})"

        return True, None

    def close(self):
        if hasattr(self, "_detector"):
            self._detector.close()

    def __del__(self):
        try:
            self.close()
        except Exception:
            pass
