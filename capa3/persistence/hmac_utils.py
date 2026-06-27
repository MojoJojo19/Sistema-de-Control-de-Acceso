"""
HMAC-SHA256 Utilities — §6.3.4.3

Cálculo y verificación de firma HMAC-SHA256 para integridad de logs.

Spec §6.3.4.3:
    Campo hmac_signature: HMAC-SHA256 de
    timestamp_utc + node_id + user_id + event_type + decision + similarity_score
"""

import hmac
import hashlib
import logging

from capa3.config import HMAC_SECRET_KEY

logger = logging.getLogger(__name__)


def calcular_hmac(log_dict: dict, secret_key: bytes = HMAC_SECRET_KEY) -> str:
    """
    Calcula HMAC-SHA256 de un registro de log — exactamente como §6.3.4.3.

    Args:
        log_dict: Diccionario con los campos del log:
            - timestamp_utc: str o datetime
            - node_id: str
            - user_id: int o None
            - event_type: str
            - decision: str (GRANT/DENY)
            - similarity_score: float o None

    Returns:
        HMAC-SHA256 en formato hexadecimal (64 caracteres).
    """
    similarity = log_dict.get("similarity_score")
    if similarity is None:
        similarity = 0.0

    mensaje = (
        f"{log_dict['timestamp_utc']}"
        f"{log_dict.get('node_id', '')}"
        f"{log_dict.get('user_id', '')}"
        f"{log_dict['event_type']}"
        f"{log_dict['decision']}"
        f"{similarity:.4f}"
    ).encode("utf-8")

    signature = hmac.new(secret_key, mensaje, hashlib.sha256).hexdigest()
    return signature


def verificar_hmac(
    log_dict: dict,
    expected_signature: str,
    secret_key: bytes = HMAC_SECRET_KEY,
) -> bool:
    """
    Verifica la firma HMAC de un registro de log.

    §6.3.4.3: Verificación periódica — script diario recalcula HMAC
    de cada registro; discrepancia → alerta CRITICO.

    Args:
        log_dict: Diccionario con los campos del log.
        expected_signature: Firma HMAC almacenada en BD.

    Returns:
        True si la firma es válida, False si fue alterada.
    """
    computed = calcular_hmac(log_dict, secret_key)
    is_valid = hmac.compare_digest(computed, expected_signature)

    if not is_valid:
        logger.critical(
            "INTEGRIDAD COMPROMETIDA: HMAC inválido para log con "
            "timestamp=%s, node=%s, user=%s, event=%s",
            log_dict.get("timestamp_utc"),
            log_dict.get("node_id"),
            log_dict.get("user_id"),
            log_dict.get("event_type"),
        )

    return is_valid
