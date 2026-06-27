"""
Motor de IA Centralizado — Pipeline de 9 Pasos — §6.3.1.2

Orquesta el pipeline completo de reconocimiento facial:
    [1] Decodificación + preprocesamiento (OpenCV)
    [2] MediaPipe FaceMesh → validación geometría
    [3] MiniFASNet Liveness → score ≥ 0.85
    [4] MTCNN detección → confianza ≥ 0.90
    [5] Calidad Laplaciana → resolución + nitidez
    [6] InceptionResnetV1 → embedding 512-dim
    [7] FAISS cosine search → distancia ≤ 0.40
    [8] Validación de negocio (delega a decision_chain)
    [9] GRANT → MQTT + log

Latencia objetivo: < 500 ms end-to-end (§6.3.1.3)
"""

import logging
import time
from dataclasses import dataclass, field

import numpy as np

from capa3.config import Decision, EventType, Severity, EVENT_SEVERITY_MAP
from capa3.models.face_mesh import FaceMeshAnalyzer
from capa3.models.liveness import BaseLivenessDetector, create_liveness_detector
from capa3.models.detector import FaceDetector
from capa3.models.embedder import FaceEmbedder
from capa3.models.faiss_index import FAISSIndex
from capa3.pipeline.preprocessor import decode_image
from capa3.pipeline.quality import check_quality

logger = logging.getLogger(__name__)


@dataclass
class StepTiming:
    """Tiempo de ejecución de un paso del pipeline."""
    step_name: str
    duration_ms: float


@dataclass
class PipelineResult:
    """Resultado completo del pipeline de reconocimiento."""
    decision: str  # GRANT o DENY
    event_type: str  # EventType.*
    severity: str  # Severity.*
    user_id: int | None = None
    similarity_score: float = 0.0
    liveness_score: float = 0.0
    confidence: float = 0.0
    reason: str = ""
    embedding: np.ndarray | None = None
    evidence_image: bytes | None = None  # Frame JPEG para evidencia
    timings: list[StepTiming] = field(default_factory=list)
    total_ms: float = 0.0


class IAEngine:
    """
    Motor de IA Centralizado — §6.3.1

    Ejecuta el pipeline de 9 pasos sobre una imagen JPEG recibida
    del ESP32-S3. Retorna una decisión GRANT/DENY con todos los
    metadatos necesarios para logging y alertas.
    """

    def __init__(self, faiss_index: FAISSIndex):
        """
        Inicializa todos los modelos del pipeline.

        Args:
            faiss_index: Índice FAISS cargado con embeddings de usuarios registrados.
        """
        logger.info("Inicializando Motor de IA...")
        t0 = time.time()

        self._face_mesh = FaceMeshAnalyzer()
        self._liveness = create_liveness_detector()
        self._detector = FaceDetector()
        self._embedder = FaceEmbedder()
        self._faiss_index = faiss_index

        elapsed = (time.time() - t0) * 1000
        logger.info("Motor de IA inicializado en %.0f ms", elapsed)

    @property
    def faiss_index(self) -> FAISSIndex:
        return self._faiss_index

    @property
    def embedder(self) -> FaceEmbedder:
        return self._embedder

    @property
    def detector(self) -> FaceDetector:
        return self._detector

    def process(self, jpeg_bytes: bytes, node_id: str) -> PipelineResult:
        """
        Ejecuta el pipeline completo de reconocimiento facial.

        Args:
            jpeg_bytes: Imagen JPEG comprimida (20-80 KB del ESP32-S3).
            node_id: ID del nodo que envió la imagen.

        Returns:
            PipelineResult con decisión, scores, tiempos, y metadatos.
        """
        pipeline_start = time.time()
        timings: list[StepTiming] = []

        # =====================================================================
        # PASO 1: Decodificación y preprocesamiento — §6.3.1.2 [1]
        # =====================================================================
        t = time.time()
        image_rgb = decode_image(jpeg_bytes)
        timings.append(StepTiming("1_decode", (time.time() - t) * 1000))

        if image_rgb is None:
            return self._deny(
                EventType.NO_FACE_DETECTED,
                "Error decodificando imagen JPEG",
                timings=timings,
                pipeline_start=pipeline_start,
            )

        # =====================================================================
        # PASO 2: MediaPipe FaceMesh — §6.3.1.2 [2]
        # Valida geometría: simetría, presencia ojos/nariz/boca, |yaw| ≤ 30°
        # =====================================================================
        t = time.time()
        mesh_result = self._face_mesh.analyze(image_rgb)
        timings.append(StepTiming("2_facemesh", (time.time() - t) * 1000))

        if not mesh_result.detected or not mesh_result.geometry_valid:
            reason = mesh_result.rejection_reason or "Geometría facial inválida"
            return self._deny(
                EventType.NO_FACE_DETECTED,
                f"FaceMesh: {reason}",
                timings=timings,
                pipeline_start=pipeline_start,
            )

        # =====================================================================
        # PASO 3: Liveness Detection — §6.3.1.2 [3]
        # MiniFASNet score ≥ 0.85
        # =====================================================================
        t = time.time()
        liveness_score = self._liveness.check(image_rgb)
        timings.append(StepTiming("3_liveness", (time.time() - t) * 1000))

        if liveness_score < self._liveness.threshold:
            return self._deny(
                EventType.SPOOFING_ATTEMPT,
                f"Liveness score {liveness_score:.3f} < umbral {self._liveness.threshold}",
                liveness_score=liveness_score,
                evidence_image=jpeg_bytes,  # Frame como evidencia — §6.3.3.2
                timings=timings,
                pipeline_start=pipeline_start,
            )

        # =====================================================================
        # PASO 4: Detección de bounding box — MTCNN — §6.3.1.2 [4]
        # Confianza ≥ 0.90
        # =====================================================================
        t = time.time()
        detection = self._detector.detect(image_rgb)
        timings.append(StepTiming("4_mtcnn", (time.time() - t) * 1000))

        if not detection.detected:
            reason = detection.rejection_reason or "MTCNN no detectó rostro"
            return self._deny(
                EventType.NO_FACE_DETECTED,
                f"MTCNN: {reason}",
                liveness_score=liveness_score,
                confidence=detection.confidence,
                timings=timings,
                pipeline_start=pipeline_start,
            )

        # =====================================================================
        # PASO 5: Verificación de calidad — §6.3.1.2 [5]
        # Resolución mín 96×96 + varianza Laplaciana ≥ umbral
        # =====================================================================
        t = time.time()
        quality = check_quality(image_rgb, detection.bbox)
        timings.append(StepTiming("5_quality", (time.time() - t) * 1000))

        if not quality.passed:
            return self._deny(
                EventType.LOW_QUALITY_FRAME,
                f"Calidad: {quality.rejection_reason}",
                liveness_score=liveness_score,
                confidence=detection.confidence,
                timings=timings,
                pipeline_start=pipeline_start,
            )

        # =====================================================================
        # PASO 6: Extracción de embedding — InceptionResnetV1 — §6.3.1.2 [6]
        # Vector float32 512-dim, L2-normalizado
        # =====================================================================
        t = time.time()
        embedding = self._embedder.extract(detection.face_crop)
        timings.append(StepTiming("6_embedding", (time.time() - t) * 1000))

        # =====================================================================
        # PASO 7: Comparación vectorial — FAISS — §6.3.1.2 [7]
        # Distancia coseno ≤ 0.40 (similitud ≥ 0.82)
        # =====================================================================
        t = time.time()
        search_result = self._faiss_index.search(embedding)
        timings.append(StepTiming("7_faiss", (time.time() - t) * 1000))

        if not search_result.found:
            return self._deny(
                EventType.IDENTITY_MISMATCH,
                f"Similitud {search_result.similarity:.4f} < umbral "
                f"(distancia coseno {search_result.distance:.4f})",
                similarity_score=search_result.similarity,
                liveness_score=liveness_score,
                confidence=detection.confidence,
                embedding=embedding,  # Almacenar embedding fallido — §RF-IA-06
                user_id=search_result.user_id,
                timings=timings,
                pipeline_start=pipeline_start,
            )

        # =====================================================================
        # PASOS 8: Validación de negocio se hace en decision_chain.py
        # (horario, estado, cooldown) — se delega al caller
        #
        # Aquí retornamos éxito del pipeline de IA; la cadena fail-fast
        # completa (pasos 6-8 de negocio) se evalúa en decision_chain.
        # =====================================================================
        total_ms = (time.time() - pipeline_start) * 1000

        result = PipelineResult(
            decision=Decision.GRANT,  # Provisional — decision_chain puede cambiar a DENY
            event_type=EventType.SUCCESSFUL_ACCESS,
            severity=Severity.INFO,
            user_id=search_result.user_id,
            similarity_score=search_result.similarity,
            liveness_score=liveness_score,
            confidence=detection.confidence,
            reason="Pipeline de IA completo — identidad verificada",
            embedding=embedding,
            timings=timings,
            total_ms=total_ms,
        )

        logger.info(
            "Pipeline OK: user_id=%s, similarity=%.4f, liveness=%.3f, "
            "total=%.0f ms",
            search_result.user_id,
            search_result.similarity,
            liveness_score,
            total_ms,
        )
        return result

    def _deny(
        self,
        event_type: str,
        reason: str,
        similarity_score: float = 0.0,
        liveness_score: float = 0.0,
        confidence: float = 0.0,
        embedding: np.ndarray | None = None,
        evidence_image: bytes | None = None,
        user_id: int | None = None,
        timings: list[StepTiming] | None = None,
        pipeline_start: float = 0.0,
    ) -> PipelineResult:
        """Construye un resultado DENY con todos los metadatos."""
        total_ms = (time.time() - pipeline_start) * 1000 if pipeline_start > 0 else 0.0

        severity = EVENT_SEVERITY_MAP.get(event_type, Severity.MEDIO)

        logger.info(
            "Pipeline DENY: event=%s, severity=%s, reason=%s, total=%.0f ms",
            event_type,
            severity,
            reason,
            total_ms,
        )

        return PipelineResult(
            decision=Decision.DENY,
            event_type=event_type,
            severity=severity,
            user_id=user_id,
            similarity_score=similarity_score,
            liveness_score=liveness_score,
            confidence=confidence,
            reason=reason,
            embedding=embedding,
            evidence_image=evidence_image,
            timings=timings or [],
            total_ms=total_ms,
        )
