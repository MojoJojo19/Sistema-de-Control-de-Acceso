"""
Preprocesamiento de imagen — §6.3.1.2 Paso 1

Decodifica la imagen JPEG recibida vía HTTP POST y la prepara
para el pipeline de IA.

Pipeline:
    cv2.imdecode → BGR→RGB → resize 160×160 px
"""

import logging

import cv2
import numpy as np

from capa3.config import FACE_INPUT_SIZE

logger = logging.getLogger(__name__)


def decode_image(jpeg_bytes: bytes) -> np.ndarray | None:
    """
    Decodifica una imagen JPEG desde bytes.

    Args:
        jpeg_bytes: Imagen JPEG comprimida (20-80 KB del ESP32-S3).

    Returns:
        Imagen RGB como numpy array (H, W, 3), uint8.
        None si la decodificación falla.
    """
    np_arr = np.frombuffer(jpeg_bytes, dtype=np.uint8)
    bgr_image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if bgr_image is None:
        logger.error("Error decodificando imagen JPEG (%d bytes)", len(jpeg_bytes))
        return None

    # BGR → RGB
    rgb_image = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)

    logger.debug(
        "Imagen decodificada: %dx%d px, %d bytes",
        rgb_image.shape[1],
        rgb_image.shape[0],
        len(jpeg_bytes),
    )
    return rgb_image


def resize_for_model(image_rgb: np.ndarray, size: int = FACE_INPUT_SIZE) -> np.ndarray:
    """
    Redimensiona imagen para el modelo (160×160 px).

    Args:
        image_rgb: Imagen RGB (H, W, 3), uint8.
        size: Tamaño de salida (default: 160).

    Returns:
        Imagen redimensionada (size, size, 3), uint8.
    """
    resized = cv2.resize(image_rgb, (size, size), interpolation=cv2.INTER_LINEAR)
    return resized


def load_image_file(filepath: str) -> np.ndarray | None:
    """
    Carga una imagen desde archivo (para enrollment y testing).

    Args:
        filepath: Ruta al archivo de imagen.

    Returns:
        Imagen RGB como numpy array (H, W, 3), uint8.
    """
    bgr = cv2.imread(filepath, cv2.IMREAD_COLOR)
    if bgr is None:
        logger.error("No se pudo cargar imagen: %s", filepath)
        return None

    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    logger.debug("Imagen cargada: %s (%dx%d)", filepath, rgb.shape[1], rgb.shape[0])
    return rgb
