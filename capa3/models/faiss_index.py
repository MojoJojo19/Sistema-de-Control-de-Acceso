"""
Índice FAISS — Búsqueda Vectorial por Similitud Coseno — §6.3.1.2 Paso 7

Implementa la búsqueda eficiente de embeddings contra la base de datos
de usuarios registrados usando FAISS IndexFlatIP (inner product).

Sobre vectores L2-normalizados:
    inner_product(a, b) = cosine_similarity(a, b)
    
Por lo tanto, usamos IndexFlatIP para búsquedas de similitud coseno.

Spec §6.3.2.5:
    Distancia coseno ≤ 0.40 ←→ Similitud coseno ≥ 0.82 ←→ GRANT
"""

import logging
from dataclasses import dataclass
from threading import Lock

import faiss
import numpy as np

from capa3.config import COSINE_DISTANCE_THRESHOLD, EMBEDDING_DIM, SIMILARITY_THRESHOLD

logger = logging.getLogger(__name__)


@dataclass
class SearchResult:
    """Resultado de una búsqueda en el índice FAISS."""
    found: bool
    user_id: int | None
    similarity: float  # Similitud coseno [0, 1]
    distance: float  # Distancia coseno [0, 2]


class FAISSIndex:
    """
    Índice FAISS para búsqueda de embeddings faciales.
    
    Usa IndexFlatIP (inner product) sobre vectores L2-normalizados,
    que es equivalente a cosine similarity.
    
    Thread-safe mediante Lock.
    """

    def __init__(self):
        self._index = faiss.IndexFlatIP(EMBEDDING_DIM)
        self._user_ids: list[int] = []  # Mapeo índice FAISS → user_id
        self._lock = Lock()

        logger.info("FAISS IndexFlatIP creado: dim=%d", EMBEDDING_DIM)

    @property
    def total_embeddings(self) -> int:
        """Cantidad de embeddings en el índice."""
        return self._index.ntotal

    def add(self, embedding: np.ndarray, user_id: int) -> None:
        """
        Agrega un embedding al índice.

        Args:
            embedding: Vector float32 (512,) L2-normalizado.
            user_id: ID del usuario en la base de datos.
        """
        with self._lock:
            embedding = embedding.reshape(1, -1).astype(np.float32)
            self._index.add(embedding)
            self._user_ids.append(user_id)

        logger.debug(
            "Embedding agregado: user_id=%d, total=%d",
            user_id,
            self.total_embeddings,
        )

    def search(self, query_embedding: np.ndarray, k: int = 1) -> SearchResult:
        """
        Busca el embedding más similar en el índice.

        Args:
            query_embedding: Vector float32 (512,) L2-normalizado.
            k: Número de vecinos a retornar.

        Returns:
            SearchResult con user_id más similar, similitud, y distancia coseno.
        """
        if self.total_embeddings == 0:
            logger.debug("FAISS: índice vacío, no hay embeddings registrados")
            return SearchResult(
                found=False,
                user_id=None,
                similarity=0.0,
                distance=2.0,
            )

        with self._lock:
            query = query_embedding.reshape(1, -1).astype(np.float32)
            similarities, indices = self._index.search(query, k)

        best_similarity = float(similarities[0][0])
        best_index = int(indices[0][0])

        # Distancia coseno = 1 - similitud coseno
        distance = 1.0 - best_similarity

        if best_index < 0 or best_index >= len(self._user_ids):
            return SearchResult(
                found=False,
                user_id=None,
                similarity=best_similarity,
                distance=distance,
            )

        user_id = self._user_ids[best_index]

        # Evaluar contra umbral — §6.3.2.5
        found = best_similarity >= SIMILARITY_THRESHOLD

        logger.debug(
            "FAISS search: user_id=%s, similarity=%.4f, distance=%.4f, "
            "threshold=%.2f, found=%s",
            user_id,
            best_similarity,
            distance,
            SIMILARITY_THRESHOLD,
            found,
        )
        return SearchResult(
            found=found,
            user_id=user_id,
            similarity=best_similarity,
            distance=distance,
        )

    def remove_user(self, user_id: int) -> None:
        """
        Elimina todos los embeddings de un usuario del índice.
        
        FAISS IndexFlat no soporta eliminación directa;
        reconstruimos el índice sin el usuario.
        """
        with self._lock:
            if user_id not in self._user_ids:
                return

            # Reconstruir índice sin el usuario
            all_embeddings = faiss.rev_swig_ptr(
                self._index.get_xb(), self._index.ntotal * EMBEDDING_DIM
            ).reshape(-1, EMBEDDING_DIM).copy()

            mask = [uid != user_id for uid in self._user_ids]
            filtered_embeddings = all_embeddings[mask]
            filtered_ids = [uid for uid in self._user_ids if uid != user_id]

            self._index.reset()
            if len(filtered_embeddings) > 0:
                self._index.add(filtered_embeddings.astype(np.float32))
            self._user_ids = filtered_ids

        logger.info(
            "Usuario %d eliminado del índice. Total embeddings: %d",
            user_id,
            self.total_embeddings,
        )

    def rebuild_from_data(
        self, embeddings: list[np.ndarray], user_ids: list[int]
    ) -> None:
        """
        Reconstruye el índice completo desde datos de la base de datos.

        Args:
            embeddings: Lista de embeddings float32 (512,).
            user_ids: Lista de IDs de usuario correspondientes.
        """
        with self._lock:
            self._index.reset()
            self._user_ids.clear()

            if len(embeddings) > 0:
                matrix = np.stack(embeddings, axis=0).astype(np.float32)
                self._index.add(matrix)
                self._user_ids = list(user_ids)

        logger.info(
            "Índice FAISS reconstruido: %d embeddings cargados",
            self.total_embeddings,
        )
