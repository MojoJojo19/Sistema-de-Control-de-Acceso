"""
InceptionResnetV1 — Extracción de Embeddings Faciales — §6.3.2.1, §6.3.2.2

Paso 6 del pipeline:
    - Recibe face crop 160×160 float32
    - Produce embedding float32 de 512 dimensiones
    - Normalizado L2 (vector unitario en hiperesfera)

Configuración del spec:
    pretrained='vggface2'
    classify=False
    device='cpu'
    .eval()
"""

import logging

import numpy as np
import torch
import torch.nn.functional as F
from facenet_pytorch import InceptionResnetV1
from PIL import Image

from capa3.config import EMBEDDING_DIM, EMBEDDING_PRETRAINED

logger = logging.getLogger(__name__)


class FaceEmbedder:
    """
    Extractor de embeddings faciales con InceptionResnetV1.
    
    Produce vectores de 512 dimensiones L2-normalizados,
    preentrenado en VGGFace2 (3.31M imágenes, 9,131 identidades).
    
    Spec §6.3.2.2:
        Input:  Face crop 160×160×3 (RGB, float32, normalizado [-1, 1])
        Output: Embedding float32 [512] (vector unitario en hiperesfera)
    """

    def __init__(self):
        self._model = InceptionResnetV1(
            pretrained=EMBEDDING_PRETRAINED,
            classify=False,
            device="cpu",
        ).eval()

        logger.info(
            "InceptionResnetV1 cargado: pretrained=%s, embedding_dim=%d",
            EMBEDDING_PRETRAINED,
            EMBEDDING_DIM,
        )

    @torch.no_grad()
    def extract(self, face_crop: torch.Tensor) -> np.ndarray:
        """
        Extrae embedding de un face crop.

        Args:
            face_crop: Tensor (3, 160, 160) float32 del MTCNN.
                       Valores en rango [-1, 1] (normalización estándar de facenet-pytorch).

        Returns:
            Embedding numpy array de shape (512,), float32, L2-normalizado.
        """
        if face_crop.dim() == 3:
            face_crop = face_crop.unsqueeze(0)  # (1, 3, 160, 160)

        embedding = self._model(face_crop)  # (1, 512)
        embedding = F.normalize(embedding, p=2, dim=1)  # L2 normalización
        result = embedding.squeeze(0).numpy()

        logger.debug(
            "Embedding extraído: shape=%s, norm=%.4f",
            result.shape,
            np.linalg.norm(result),
        )
        return result

    @torch.no_grad()
    def extract_from_images(self, face_crops: list[torch.Tensor]) -> np.ndarray:
        """
        Extrae embedding promediado de múltiples face crops (enrollment).
        
        Spec §6.3.2.3: 3-5 fotos → promedio de embeddings → re-normalización L2.

        Args:
            face_crops: Lista de tensores (3, 160, 160) float32.

        Returns:
            Embedding promediado y re-normalizado, numpy array (512,).
        """
        embeddings = []
        for crop in face_crops:
            emb = self.extract(crop)
            embeddings.append(emb)

        # Promedio de embeddings — §6.3.2.3
        stacked = np.stack(embeddings, axis=0)
        mean_embedding = stacked.mean(axis=0)

        # Re-normalización L2
        norm = np.linalg.norm(mean_embedding)
        if norm > 0:
            mean_embedding = mean_embedding / norm

        logger.info(
            "Embedding promediado de %d imágenes, norm=%.4f",
            len(face_crops),
            np.linalg.norm(mean_embedding),
        )
        return mean_embedding
