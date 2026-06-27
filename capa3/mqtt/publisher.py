"""
MQTT Publisher — §6.3.1 RF-IA-05

Publica decisiones y alertas en topics MQTT definidos en Capa 2.

Topics:
    acceso/puerta/{node_id}/comando  → GRANT/DENY + token
    sistema/alertas/{severidad}      → JSON con evento
    sistema/nodos/{node_id}/heartbeat → ping periódico

Graceful degradation: si el broker no está disponible,
los errores se loguean sin bloquear el pipeline.
"""

import json
import logging
import time
from typing import Any

from capa3.config import (
    MQTT_BROKER_HOST,
    MQTT_BROKER_PORT,
    MQTT_CLIENT_ID,
    MQTT_KEEPALIVE,
    MQTT_TOPIC_ALERTAS,
    MQTT_TOPIC_COMANDO,
)

logger = logging.getLogger(__name__)


class MQTTPublisher:
    """
    Publisher MQTT para decisiones y alertas.
    
    Usa paho-mqtt. Funciona sin broker activo — los errores
    de conexión se loguean sin bloquear el pipeline.
    """

    def __init__(self):
        self._client = None
        self._connected = False
        self._connect()

    def _connect(self) -> None:
        """Intenta conectar al broker MQTT."""
        try:
            import paho.mqtt.client as mqtt

            self._client = mqtt.Client(
                client_id=MQTT_CLIENT_ID,
                protocol=mqtt.MQTTv311,
            )
            self._client.username_pw_set("capa3_motor_ia", "internal_backend_secret")
            self._client.on_connect = self._on_connect
            self._client.on_disconnect = self._on_disconnect

            self._client.connect_async(
                MQTT_BROKER_HOST,
                MQTT_BROKER_PORT,
                MQTT_KEEPALIVE,
            )
            self._client.loop_start()
            logger.info(
                "MQTT: conectando a %s:%d...",
                MQTT_BROKER_HOST,
                MQTT_BROKER_PORT,
            )
        except ImportError:
            logger.warning("paho-mqtt no instalado — MQTT deshabilitado")
            self._client = None
        except Exception as e:
            logger.warning("MQTT: no se pudo conectar a %s:%d — %s", 
                         MQTT_BROKER_HOST, MQTT_BROKER_PORT, e)
            self._client = None

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self._connected = True
            logger.info("MQTT: conectado exitosamente al broker")
        else:
            logger.warning("MQTT: conexión fallida, código=%d", rc)

    def _on_disconnect(self, client, userdata, rc):
        self._connected = False
        if rc != 0:
            logger.warning("MQTT: desconexión inesperada, código=%d", rc)

    def publish_decision(
        self,
        node_id: str,
        decision: str,
        session_token: str | None = None,
        user_id: int | None = None,
        similarity_score: float = 0.0,
    ) -> bool:
        """
        Publica decisión GRANT/DENY al topic del nodo.
        
        §6.3.1 RF-IA-05: Publicar decisión vía MQTT al topic
        acceso/puerta/{id}/comando.

        Args:
            node_id: ID del nodo destino.
            decision: 'GRANT' o 'DENY'.
            session_token: Token de sesión (solo para GRANT).
            user_id: ID del usuario (si identificado).
            similarity_score: Score de similitud.

        Returns:
            True si se publicó exitosamente.
        """
        topic = MQTT_TOPIC_COMANDO.format(node_id=node_id)
        payload = {
            "decision": decision,
            "timestamp": time.time(),
            "user_id": user_id,
            "similarity_score": similarity_score,
        }
        if session_token:
            payload["session_token"] = session_token

        return self._publish(topic, payload, qos=1)

    def publish_alert(
        self,
        severity: str,
        event_type: str,
        node_id: str,
        details: dict | None = None,
    ) -> bool:
        """
        Publica alerta al topic de alertas.
        
        §6.3.3.2: Topic MQTT sistema/alertas/{severidad}.
        """
        topic = MQTT_TOPIC_ALERTAS.format(severidad=severity)
        payload = {
            "event_type": event_type,
            "node_id": node_id,
            "severity": severity,
            "timestamp": time.time(),
        }
        if details:
            payload.update(details)

        # QoS 2 para eventos CRÍTICOS — §Capa 2 specs
        qos = 2 if severity in ("CRITICO", "ALTO") else 1
        return self._publish(topic, payload, qos=qos)

    def _publish(self, topic: str, payload: dict, qos: int = 1) -> bool:
        """Publica un mensaje JSON al topic."""
        if self._client is None or not self._connected:
            logger.debug(
                "MQTT no disponible — mensaje no publicado: topic=%s", topic
            )
            return False

        try:
            message = json.dumps(payload, ensure_ascii=False)
            result = self._client.publish(topic, message, qos=qos)
            if result.rc == 0:
                logger.debug("MQTT publicado: topic=%s, qos=%d", topic, qos)
                return True
            else:
                logger.warning(
                    "MQTT publish fallido: topic=%s, rc=%d", topic, result.rc
                )
                return False
        except Exception as e:
            logger.error("Error publicando MQTT: %s", e)
            return False

    def disconnect(self) -> None:
        """Desconecta del broker MQTT."""
        if self._client is not None:
            try:
                self._client.loop_stop()
                self._client.disconnect()
                logger.info("MQTT desconectado")
            except Exception:
                pass

    def __del__(self):
        self.disconnect()
