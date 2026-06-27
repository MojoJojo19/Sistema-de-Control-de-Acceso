"""
Rate Limiter — §6.3.3.1 Paso 8 + §6.3.3.2 BRUTE_FORCE_DETECTED

Implementa:
    1. Cooldown de 3 s entre accesos del mismo usuario (Paso 8)
    2. Detección de brute force: ≥ 5 DENY en < 120 s → bloqueo 300 s (BRUTE_FORCE_DETECTED)
    3. Bloqueo de nodo por spoofing: 60 s (SPOOFING_ATTEMPT)
"""

import logging
import time
from collections import defaultdict
from dataclasses import dataclass
from threading import Lock

from capa3.config import (
    BRUTE_FORCE_BLOCK_SECONDS,
    BRUTE_FORCE_MAX_ATTEMPTS,
    BRUTE_FORCE_WINDOW_SECONDS,
    COOLDOWN_SECONDS,
    SPOOFING_BLOCK_SECONDS,
)

logger = logging.getLogger(__name__)


@dataclass
class RateLimitCheck:
    """Resultado de la verificación de rate limiting."""
    allowed: bool
    reason: str | None = None
    blocked_until: float | None = None  # timestamp de desbloqueo


class RateLimiter:
    """
    Rate limiter con cooldown por usuario y detección de brute force por nodo.
    
    Thread-safe mediante Lock.
    
    §6.3.3.1 Paso 8: Cooldown de 3 s entre accesos del mismo usuario.
    §6.3.3.2 BRUTE_FORCE_DETECTED: ≥ 5 DENY en < 120 s desde el mismo nodo.
    §6.3.3.2 SPOOFING_ATTEMPT: Bloqueo del nodo por 60 s.
    """

    def __init__(self):
        self._user_last_access: dict[int, float] = {}  # user_id → timestamp
        self._node_deny_history: dict[str, list[float]] = defaultdict(list)  # node_id → [timestamps]
        self._node_blocked_until: dict[str, float] = {}  # node_id → unblock timestamp
        self._lock = Lock()

    def check_user_cooldown(self, user_id: int) -> RateLimitCheck:
        """
        Verifica el cooldown de 3 s para un usuario.
        
        §6.3.3.1 Paso 8: Intervalo mínimo de 3 s entre accesos.
        """
        now = time.time()
        with self._lock:
            last_access = self._user_last_access.get(user_id)
            if last_access is not None:
                elapsed = now - last_access
                if elapsed < COOLDOWN_SECONDS:
                    remaining = COOLDOWN_SECONDS - elapsed
                    return RateLimitCheck(
                        allowed=False,
                        reason=(
                            f"Cooldown activo: {elapsed:.1f} s desde último acceso "
                            f"(mín. {COOLDOWN_SECONDS} s)"
                        ),
                    )
        return RateLimitCheck(allowed=True)

    def record_user_access(self, user_id: int) -> None:
        """Registra un acceso de usuario para tracking de cooldown."""
        with self._lock:
            self._user_last_access[user_id] = time.time()

    def check_node_blocked(self, node_id: str) -> RateLimitCheck:
        """
        Verifica si un nodo está bloqueado.
        
        §6.3.3.2: SPOOFING_ATTEMPT → 60 s, BRUTE_FORCE → 300 s.
        """
        now = time.time()
        with self._lock:
            blocked_until = self._node_blocked_until.get(node_id)
            if blocked_until is not None and now < blocked_until:
                remaining = blocked_until - now
                return RateLimitCheck(
                    allowed=False,
                    reason=f"Nodo {node_id} bloqueado por {remaining:.0f} s más",
                    blocked_until=blocked_until,
                )
            elif blocked_until is not None:
                # Expiró el bloqueo
                del self._node_blocked_until[node_id]

        return RateLimitCheck(allowed=True)

    def record_node_deny(self, node_id: str) -> bool:
        """
        Registra un DENY para un nodo y evalúa brute force.
        
        §6.3.3.2: ≥ 5 DENY en < 120 s → BRUTE_FORCE_DETECTED.

        Returns:
            True si se detectó brute force (nodo bloqueado 300 s).
        """
        now = time.time()
        with self._lock:
            history = self._node_deny_history[node_id]

            # Limpiar entradas fuera de la ventana
            history[:] = [
                t for t in history if now - t < BRUTE_FORCE_WINDOW_SECONDS
            ]

            history.append(now)

            if len(history) >= BRUTE_FORCE_MAX_ATTEMPTS:
                # BRUTE_FORCE_DETECTED — bloquear nodo 300 s
                self._node_blocked_until[node_id] = now + BRUTE_FORCE_BLOCK_SECONDS
                history.clear()
                logger.warning(
                    "BRUTE_FORCE_DETECTED: nodo %s — %d DENY en %.0f s — "
                    "bloqueado %d s",
                    node_id,
                    BRUTE_FORCE_MAX_ATTEMPTS,
                    BRUTE_FORCE_WINDOW_SECONDS,
                    BRUTE_FORCE_BLOCK_SECONDS,
                )
                return True

        return False

    def block_node_spoofing(self, node_id: str) -> None:
        """
        Bloquea un nodo por SPOOFING_ATTEMPT — 60 s.
        §6.3.3.2: Bloqueo temporal del nodo.
        """
        with self._lock:
            self._node_blocked_until[node_id] = time.time() + SPOOFING_BLOCK_SECONDS
        logger.warning(
            "Nodo %s bloqueado por %d s (SPOOFING_ATTEMPT)",
            node_id,
            SPOOFING_BLOCK_SECONDS,
        )

    def unblock_node(self, node_id: str) -> None:
        """Desbloquea manualmente un nodo (acción del administrador)."""
        with self._lock:
            self._node_blocked_until.pop(node_id, None)
            self._node_deny_history.pop(node_id, None)
        logger.info("Nodo %s desbloqueado manualmente", node_id)
