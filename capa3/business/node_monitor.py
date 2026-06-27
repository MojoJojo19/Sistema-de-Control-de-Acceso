"""
Monitor de Nodos — Máquina de Estados OFFLINE_EMERGENCY — §6.3.3.3

Implementa la máquina de estados del nodo:
    ONLINE → DEGRADADO → OFFLINE → RECONECTADO

Mecanismos de detección:
    - Heartbeat MQTT: cada 30 s, timeout a 90 s
    - Watchdog HTTP: 5 s timeout, 3 timeouts → OFFLINE
"""

import json
import logging
import time
from dataclasses import dataclass
from threading import Lock

from capa3.config import (
    HEARTBEAT_PING_RETRY_SECONDS,
    HEARTBEAT_TIMEOUT_SECONDS,
    HTTP_WATCHDOG_MAX_TIMEOUTS,
    HTTP_WATCHDOG_TIMEOUT_SECONDS,
    NodeState,
)

logger = logging.getLogger(__name__)


@dataclass
class NodeStatus:
    """Estado actual de un nodo."""
    node_id: str
    state: str  # NodeState.*
    last_heartbeat: float  # timestamp
    timeout_count: int
    blocked_until: float | None  # timestamp si bloqueado por rate limiter
    pending_sync_count: int  # Registros pendientes de sincronización


class NodeMonitor:
    """
    Monitor de nodos con máquina de estados — §6.3.3.3.
    
    Rastrea el estado de cada nodo ESP32-S3 y gestiona
    transiciones ONLINE → DEGRADADO → OFFLINE → RECONECTADO.
    
    Thread-safe mediante Lock.
    """

    def __init__(self):
        self._nodes: dict[str, NodeStatus] = {}
        self._sync_queues: dict[str, list[dict]] = {}  # Cola FIFO por nodo
        self._lock = Lock()

    def register_node(self, node_id: str) -> None:
        """Registra un nodo nuevo con estado ONLINE."""
        with self._lock:
            self._nodes[node_id] = NodeStatus(
                node_id=node_id,
                state=NodeState.ONLINE,
                last_heartbeat=time.time(),
                timeout_count=0,
                blocked_until=None,
                pending_sync_count=0,
            )
            self._sync_queues[node_id] = []
        logger.info("Nodo registrado: %s → ONLINE", node_id)

    def receive_heartbeat(self, node_id: str) -> str:
        """
        Procesa un heartbeat recibido de un nodo.

        Returns:
            Nuevo estado del nodo.
        """
        with self._lock:
            if node_id not in self._nodes:
                self.register_node(node_id)
                return NodeState.ONLINE

            node = self._nodes[node_id]
            previous_state = node.state
            node.last_heartbeat = time.time()
            node.timeout_count = 0

            if previous_state == NodeState.OFFLINE:
                node.state = NodeState.RECONECTADO
                logger.info(
                    "Nodo %s: OFFLINE → RECONECTADO (heartbeat recibido)",
                    node_id,
                )
            elif previous_state in (NodeState.DEGRADADO, NodeState.RECONECTADO):
                node.state = NodeState.ONLINE
                logger.info(
                    "Nodo %s: %s → ONLINE (heartbeat recibido)",
                    node_id,
                    previous_state,
                )
            # ONLINE permanece ONLINE

            return node.state

    def record_http_timeout(self, node_id: str) -> str:
        """
        Registra un timeout HTTP para un nodo.
        
        §6.3.3.3 Watchdog HTTP:
        - 1-2 timeouts → DEGRADADO
        - 3+ timeouts → OFFLINE

        Returns:
            Nuevo estado del nodo.
        """
        with self._lock:
            if node_id not in self._nodes:
                return NodeState.ONLINE

            node = self._nodes[node_id]
            node.timeout_count += 1

            if node.timeout_count >= HTTP_WATCHDOG_MAX_TIMEOUTS:
                if node.state != NodeState.OFFLINE:
                    node.state = NodeState.OFFLINE
                    self._open_sync_queue(node_id)
                    logger.warning(
                        "Nodo %s → OFFLINE (%d timeouts consecutivos)",
                        node_id,
                        node.timeout_count,
                    )
            elif node.timeout_count >= 1:
                if node.state == NodeState.ONLINE:
                    node.state = NodeState.DEGRADADO
                    logger.info(
                        "Nodo %s → DEGRADADO (%d timeouts)",
                        node_id,
                        node.timeout_count,
                    )

            return node.state

    def check_heartbeat_timeouts(self) -> list[str]:
        """
        Verifica timeouts de heartbeat para todos los nodos.
        Debe llamarse periódicamente (e.g., cada 30 s).
        
        §6.3.3.3: Si no se recibe heartbeat en 90 s → OFFLINE.

        Returns:
            Lista de node_ids que transicionaron a OFFLINE.
        """
        now = time.time()
        newly_offline = []

        with self._lock:
            for node_id, node in self._nodes.items():
                if node.state == NodeState.OFFLINE:
                    continue

                elapsed = now - node.last_heartbeat
                if elapsed > HEARTBEAT_TIMEOUT_SECONDS:
                    node.state = NodeState.OFFLINE
                    self._open_sync_queue(node_id)
                    newly_offline.append(node_id)
                    logger.warning(
                        "Nodo %s → OFFLINE (heartbeat timeout: %.0f s > %d s)",
                        node_id,
                        elapsed,
                        HEARTBEAT_TIMEOUT_SECONDS,
                    )

        return newly_offline

    def get_status(self, node_id: str) -> NodeStatus | None:
        """Retorna el estado actual de un nodo."""
        with self._lock:
            return self._nodes.get(node_id)

    def get_all_statuses(self) -> dict[str, NodeStatus]:
        """Retorna el estado de todos los nodos."""
        with self._lock:
            return dict(self._nodes)

    def _open_sync_queue(self, node_id: str) -> None:
        """
        Abre una cola FIFO de sincronización para un nodo OFFLINE.
        §6.3.3.3: Cola FIFO en servidor para eventos pendientes.
        """
        if node_id not in self._sync_queues:
            self._sync_queues[node_id] = []
        logger.info("Cola de sincronización abierta para nodo %s", node_id)

    def enqueue_sync_event(self, node_id: str, event: dict) -> None:
        """Encola un evento para sincronización posterior."""
        with self._lock:
            if node_id in self._sync_queues:
                self._sync_queues[node_id].append(event)

    def get_pending_sync(self, node_id: str) -> list[dict]:
        """Retorna eventos pendientes de sincronización."""
        with self._lock:
            return list(self._sync_queues.get(node_id, []))

    def clear_sync_queue(self, node_id: str) -> int:
        """
        Limpia la cola de sincronización (post-reconexión exitosa).
        
        §6.3.3.3 Paso 4: Servidor confirma sincronización → nodo limpia MicroSD.

        Returns:
            Cantidad de eventos sincronizados.
        """
        with self._lock:
            queue = self._sync_queues.get(node_id, [])
            count = len(queue)
            self._sync_queues[node_id] = []

            if node_id in self._nodes:
                self._nodes[node_id].state = NodeState.ONLINE
                self._nodes[node_id].pending_sync_count = 0

        logger.info(
            "Sincronización completada para nodo %s: %d eventos procesados",
            node_id,
            count,
        )
        return count

    def generate_whitelist(self, node_id: str, active_users: list[dict]) -> str:
        """
        Genera lista blanca cifrada para un nodo OFFLINE.
        
        §6.3.3.3: Snapshot JSON de usuarios activos firmado con HMAC-SHA256.

        Args:
            node_id: ID del nodo.
            active_users: Lista de dicts con {user_id, nombre, embedding_hash}.

        Returns:
            JSON string de la lista blanca.
        """
        import hmac
        import hashlib
        from capa3.config import HMAC_SECRET_KEY

        whitelist = {
            "node_id": node_id,
            "timestamp": time.time(),
            "users": active_users,
        }

        # Firmar con HMAC-SHA256 — §6.3.3.3
        whitelist_json = json.dumps(whitelist, sort_keys=True)
        signature = hmac.new(
            HMAC_SECRET_KEY, whitelist_json.encode(), hashlib.sha256
        ).hexdigest()
        whitelist["hmac_signature"] = signature

        result = json.dumps(whitelist, ensure_ascii=False)
        logger.info(
            "Lista blanca generada para nodo %s: %d usuarios",
            node_id,
            len(active_users),
        )
        return result
