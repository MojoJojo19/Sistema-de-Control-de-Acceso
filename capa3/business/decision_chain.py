"""
Cadena de Decisión — Patrón Fail-Fast (8 Pasos) — §6.3.3.1

Módulo intermediario entre el Motor de IA y la Capa de Aplicación.
Traduce los resultados probabilísticos del modelo en decisiones binarias (GRANT / DENY).

Pasos:
    1. Liveness Detection (score ≥ 0.85)           → Motor IA
    2. Geometría facial (FaceMesh landmarks)        → Motor IA
    3. Detección facial (MTCNN confianza ≥ 0.90)    → Motor IA
    4. Calidad del frame (96×96 + Laplaciano)       → Motor IA
    5. Similitud facial (distancia coseno ≤ 0.40)   → Motor IA
    6. Horario permitido                            → Lógica negocio
    7. Estado del usuario (ACTIVO)                  → Lógica negocio
    8. Cooldown (3 s)                               → Lógica negocio

Los pasos 1-5 son ejecutados por el Motor de IA (engine.py).
Los pasos 6-8 son ejecutados aquí, post-pipeline.
"""

import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

from capa3.config import Decision, EventType, Severity, EVENT_SEVERITY_MAP
from capa3.business.alerts import AlertManager, Alert
from capa3.business.rate_limiter import RateLimiter
from capa3.pipeline.engine import PipelineResult

logger = logging.getLogger(__name__)


@dataclass
class AccessDecision:
    """Decisión final de acceso tras la cadena completa de 8 pasos."""
    decision: str  # GRANT o DENY
    event_type: str  # EventType.*
    severity: str  # Severity.*
    user_id: int | None
    node_id: str
    similarity_score: float
    liveness_score: float
    reason: str
    session_token: str | None  # Token de sesión si GRANT
    alert: Alert | None  # Alerta generada
    pipeline_result: PipelineResult  # Resultado del pipeline IA


class DecisionChain:
    """
    Cadena de decisión fail-fast — §6.3.3.1
    
    Recibe el resultado del Motor de IA (pasos 1-5 ya evaluados)
    y ejecuta los pasos de negocio restantes (6-8).
    """

    def __init__(
        self,
        rate_limiter: RateLimiter,
        alert_manager: AlertManager,
        db_session_factory=None,
    ):
        self._rate_limiter = rate_limiter
        self._alert_manager = alert_manager
        self._db_session_factory = db_session_factory

    def evaluate(
        self,
        pipeline_result: PipelineResult,
        node_id: str,
    ) -> AccessDecision:
        """
        Evalúa la cadena completa de decisión.

        Los pasos 1-5 ya fueron evaluados por el Motor de IA.
        Si el pipeline retornó DENY, se propaga directamente.
        Si retornó GRANT provisional, se evalúan pasos 6-8.

        Args:
            pipeline_result: Resultado del pipeline de IA.
            node_id: ID del nodo que originó la solicitud.

        Returns:
            AccessDecision con la decisión final.
        """
        # Si el pipeline ya denegó (pasos 1-5), propagar decisión
        if pipeline_result.decision == Decision.DENY:
            return self._handle_deny(pipeline_result, node_id)

        user_id = pipeline_result.user_id

        # =================================================================
        # PASO 6: Validación de horario permitido — §6.3.3.1
        # =================================================================
        if user_id is not None and self._db_session_factory is not None:
            schedule_check = self._check_schedule(user_id)
            if not schedule_check:
                return self._create_deny(
                    EventType.ACCESS_OUT_OF_SCHEDULE,
                    "Usuario fuera de horario permitido",
                    pipeline_result,
                    node_id,
                )

        # =================================================================
        # PASO 7: Validación de estado del usuario — §6.3.3.1
        # =================================================================
        if user_id is not None and self._db_session_factory is not None:
            status_check = self._check_user_status(user_id)
            if status_check is not None:
                return self._create_deny(
                    EventType.USER_INACTIVE,
                    status_check,
                    pipeline_result,
                    node_id,
                )

        # =================================================================
        # PASO 8: Cooldown entre intentos — §6.3.3.1
        # =================================================================
        if user_id is not None:
            cooldown_check = self._rate_limiter.check_user_cooldown(user_id)
            if not cooldown_check.allowed:
                return self._create_deny(
                    EventType.RATE_LIMIT_EXCEEDED,
                    cooldown_check.reason or "Cooldown activo",
                    pipeline_result,
                    node_id,
                )

        # =================================================================
        # TODOS LOS PASOS SUPERADOS → GRANT
        # =================================================================
        # Registrar acceso para cooldown
        if user_id is not None:
            self._rate_limiter.record_user_access(user_id)

        # Generar token de sesión — §6.3.3.1 Paso OK
        session_token = secrets.token_urlsafe(48)

        # Clasificar alerta INFO
        alert = self._alert_manager.classify(
            event_type=EventType.SUCCESSFUL_ACCESS,
            node_id=node_id,
            user_id=user_id,
            decision=Decision.GRANT,
            similarity_score=pipeline_result.similarity_score,
            liveness_score=pipeline_result.liveness_score,
            reason="Todos los umbrales superados — acceso concedido",
        )

        logger.info(
            "GRANT: user_id=%s, node=%s, similarity=%.4f, token=%s...",
            user_id,
            node_id,
            pipeline_result.similarity_score,
            session_token[:8],
        )

        return AccessDecision(
            decision=Decision.GRANT,
            event_type=EventType.SUCCESSFUL_ACCESS,
            severity=Severity.INFO,
            user_id=user_id,
            node_id=node_id,
            similarity_score=pipeline_result.similarity_score,
            liveness_score=pipeline_result.liveness_score,
            reason="Acceso concedido — todos los umbrales superados",
            session_token=session_token,
            alert=alert,
            pipeline_result=pipeline_result,
        )

    def _handle_deny(
        self,
        pipeline_result: PipelineResult,
        node_id: str,
    ) -> AccessDecision:
        """Maneja un DENY del pipeline de IA (pasos 1-5)."""
        event_type = pipeline_result.event_type

        # Acciones especiales por tipo de evento
        if event_type == EventType.SPOOFING_ATTEMPT:
            self._rate_limiter.block_node_spoofing(node_id)

        # Registrar DENY para detección de brute force
        brute_force = self._rate_limiter.record_node_deny(node_id)
        if brute_force:
            event_type = EventType.BRUTE_FORCE_DETECTED
            pipeline_result.event_type = event_type
            pipeline_result.reason = (
                f"Brute force detectado: ≥5 DENY consecutivos en <120 s. "
                f"Razón original: {pipeline_result.reason}"
            )

        # Clasificar alerta
        alert = self._alert_manager.classify(
            event_type=event_type,
            node_id=node_id,
            user_id=pipeline_result.user_id,
            decision=Decision.DENY,
            similarity_score=pipeline_result.similarity_score,
            liveness_score=pipeline_result.liveness_score,
            reason=pipeline_result.reason,
        )

        return AccessDecision(
            decision=Decision.DENY,
            event_type=event_type,
            severity=pipeline_result.severity,
            user_id=pipeline_result.user_id,
            node_id=node_id,
            similarity_score=pipeline_result.similarity_score,
            liveness_score=pipeline_result.liveness_score,
            reason=pipeline_result.reason,
            session_token=None,
            alert=alert,
            pipeline_result=pipeline_result,
        )

    def _create_deny(
        self,
        event_type: str,
        reason: str,
        pipeline_result: PipelineResult,
        node_id: str,
    ) -> AccessDecision:
        """Crea un DENY para los pasos 6-8 (lógica de negocio)."""
        severity = EVENT_SEVERITY_MAP.get(event_type, Severity.MEDIO)

        alert = self._alert_manager.classify(
            event_type=event_type,
            node_id=node_id,
            user_id=pipeline_result.user_id,
            decision=Decision.DENY,
            similarity_score=pipeline_result.similarity_score,
            liveness_score=pipeline_result.liveness_score,
            reason=reason,
        )

        # Registrar DENY para brute force
        self._rate_limiter.record_node_deny(node_id)

        return AccessDecision(
            decision=Decision.DENY,
            event_type=event_type,
            severity=severity,
            user_id=pipeline_result.user_id,
            node_id=node_id,
            similarity_score=pipeline_result.similarity_score,
            liveness_score=pipeline_result.liveness_score,
            reason=reason,
            session_token=None,
            alert=alert,
            pipeline_result=pipeline_result,
        )

    def _check_schedule(self, user_id: int) -> bool:
        """
        Verifica si el usuario está dentro de su horario permitido.
        §6.3.3.1 Paso 6.
        
        Returns:
            True si está en horario, False si está fuera.
        """
        if self._db_session_factory is None:
            return True  # Sin BD, permitir

        try:
            from capa3.persistence.models_db import Usuario
            session = self._db_session_factory()
            try:
                user = session.query(Usuario).filter_by(id=user_id).first()
                if user is None:
                    return False

                if user.horario_inicio is None or user.horario_fin is None:
                    return True  # Sin horario definido = acceso 24/7

                now = datetime.now(timezone.utc)
                current_time = now.time()

                # Comparar con horario almacenado
                if user.horario_inicio <= user.horario_fin:
                    return user.horario_inicio <= current_time <= user.horario_fin
                else:
                    # Horario nocturno (e.g., 22:00 → 06:00)
                    return current_time >= user.horario_inicio or current_time <= user.horario_fin
            finally:
                session.close()
        except Exception as e:
            logger.error("Error verificando horario: %s", e)
            return True  # En caso de error, permitir (fail-open para este paso)

    def _check_user_status(self, user_id: int) -> str | None:
        """
        Verifica el estado del usuario en BD.
        §6.3.3.1 Paso 7.
        
        Returns:
            None si ACTIVO, string con razón si BLOQUEADO/SUSPENDIDO.
        """
        if self._db_session_factory is None:
            return None  # Sin BD, permitir

        try:
            from capa3.persistence.models_db import Usuario
            session = self._db_session_factory()
            try:
                user = session.query(Usuario).filter_by(id=user_id).first()
                if user is None:
                    return "Usuario no encontrado en BD"

                if user.estado != "ACTIVO":
                    return f"Usuario con estado {user.estado}"

                return None
            finally:
                session.close()
        except Exception as e:
            logger.error("Error verificando estado de usuario: %s", e)
            return None  # En caso de error, permitir
