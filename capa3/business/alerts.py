"""
Gestión de Excepciones y Alertas — §6.3.3.2

Taxonomía completa de 8 tipos de evento con 5 niveles de severidad.
Clasificación automática y routing a canales MQTT por severidad.

Severidades:
    CRITICO: SPOOFING_ATTEMPT, BRUTE_FORCE_DETECTED
    ALTO:    IDENTITY_MISMATCH, ACCESS_OUT_OF_SCHEDULE, NO_FACE_DETECTED
    MEDIO:   LOW_QUALITY_FRAME, USER_INACTIVE
    BAJO:    RATE_LIMIT_EXCEEDED
    INFO:    SUCCESSFUL_ACCESS
"""

import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, timezone

from capa3.config import (
    Decision,
    EventType,
    Severity,
    EVENT_SEVERITY_MAP,
    MQTT_TOPIC_ALERTAS,
)

logger = logging.getLogger(__name__)


@dataclass
class Alert:
    """Alerta generada por un evento del sistema."""
    event_type: str
    severity: str
    node_id: str
    user_id: int | None
    decision: str
    similarity_score: float
    liveness_score: float
    reason: str
    timestamp_utc: str
    requires_notification: bool  # Push/email para CRITICO/ALTO
    mqtt_topic: str

    def to_json(self) -> str:
        """Serializa a JSON para publicación MQTT."""
        return json.dumps(asdict(self), ensure_ascii=False)


class AlertManager:
    """
    Gestor de alertas — §6.3.3.2
    
    Clasifica eventos, genera alertas, y determina canales
    de notificación según severidad.
    """

    def classify(
        self,
        event_type: str,
        node_id: str,
        user_id: int | None = None,
        decision: str = Decision.DENY,
        similarity_score: float = 0.0,
        liveness_score: float = 0.0,
        reason: str = "",
    ) -> Alert:
        """
        Clasifica un evento y genera una alerta.

        Args:
            event_type: Tipo de evento (EventType.*).
            node_id: ID del nodo origen.
            user_id: ID del usuario (si identificado).
            decision: GRANT o DENY.
            similarity_score: Score de similitud coseno.
            liveness_score: Score de liveness.
            reason: Motivo descriptivo del evento.

        Returns:
            Alert con severidad, topic MQTT, y flag de notificación.
        """
        severity = EVENT_SEVERITY_MAP.get(event_type, Severity.MEDIO)

        # Canales de notificación — §6.3.3.2
        # CRITICO/ALTO: Push/Email inmediato + MQTT
        # MEDIO/BAJO/INFO: Solo log y reportes periódicos
        requires_notification = severity in (Severity.CRITICO, Severity.ALTO)

        # Topic MQTT — §6.3.3.2
        mqtt_topic = MQTT_TOPIC_ALERTAS.format(severidad=severity)

        timestamp = datetime.now(timezone.utc).isoformat()

        alert = Alert(
            event_type=event_type,
            severity=severity,
            node_id=node_id,
            user_id=user_id,
            decision=decision,
            similarity_score=similarity_score,
            liveness_score=liveness_score,
            reason=reason,
            timestamp_utc=timestamp,
            requires_notification=requires_notification,
            mqtt_topic=mqtt_topic,
        )

        log_fn = logger.warning if requires_notification else logger.info
        log_fn(
            "Alerta [%s] %s: node=%s, user=%s, decision=%s — %s",
            severity,
            event_type,
            node_id,
            user_id,
            decision,
            reason,
        )

        return alert

    def get_severity(self, event_type: str) -> str:
        """Retorna la severidad de un tipo de evento."""
        return EVENT_SEVERITY_MAP.get(event_type, Severity.MEDIO)

    def should_block_node(self, event_type: str) -> bool:
        """
        Determina si el evento debe bloquear el nodo.
        
        §6.3.3.2:
        - SPOOFING_ATTEMPT: bloqueo 60 s
        - BRUTE_FORCE_DETECTED: bloqueo 300 s
        """
        return event_type in (
            EventType.SPOOFING_ATTEMPT,
            EventType.BRUTE_FORCE_DETECTED,
        )
