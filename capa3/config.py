"""
Configuración centralizada — Capa 3
Todos los umbrales, constantes y parámetros definidos en specs_capa3_final.md

Referencia: §6.3.1.1, §6.3.2.4, §6.3.2.5, §6.3.3.1, §6.3.3.2, §6.3.3.3
"""

import os
from pathlib import Path


# =============================================================================
# Rutas del proyecto
# =============================================================================
BASE_DIR = Path(__file__).resolve().parent.parent  # IoT/
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models_weights"

# =============================================================================
# Base de datos — §6.3.4.1
# SQLite para desarrollo, Oracle para producción
# Cambiar DATABASE_URL para conectar a Oracle:
#   oracle+oracledb://user:pass@host:1521/service_name
# =============================================================================
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'capa3_dev.db'}"
)
DB_POOL_SIZE = 5
DB_MAX_OVERFLOW = 10

# =============================================================================
# HMAC — §6.3.4.3
# Clave secreta para firmar registros de logs_acceso
# En producción, cargar desde variable de entorno o vault
# =============================================================================
HMAC_SECRET_KEY = os.environ.get(
    "HMAC_SECRET_KEY",
    "capa3_dev_secret_key_change_in_production"
).encode("utf-8")

# =============================================================================
# JWT Autenticación — §6.2 Autenticación de Nodos
# =============================================================================
JWT_SECRET_KEY = os.environ.get(
    "JWT_SECRET_KEY",
    "capa3_jwt_secret_key_very_secure_123"
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24


# =============================================================================
# Umbrales del pipeline — §6.3.3.1 Cadena Fail-Fast
# =============================================================================

# Paso 1: Liveness Detection — §6.3.2.4
LIVENESS_THRESHOLD = 0.85  # Score mínimo de vivacidad

# Paso 2: MediaPipe FaceMesh — §6.3.2.2
FACEMESH_MIN_DETECTION_CONFIDENCE = 0.90
FACEMESH_MIN_TRACKING_CONFIDENCE = 0.85
FACEMESH_MAX_YAW_DEGREES = 30  # Rechazo si |yaw| > 30°

# Paso 3: MTCNN — §6.3.2.2
MTCNN_IMAGE_SIZE = 160
MTCNN_MARGIN = 20
MTCNN_MIN_FACE_SIZE = 80
MTCNN_THRESHOLDS = [0.6, 0.7, 0.9]  # P-Net, R-Net, O-Net
MTCNN_FACTOR = 0.709
MTCNN_MIN_CONFIDENCE = 0.90  # Confianza mínima de detección

# Paso 4: Calidad del frame — §6.3.3.1 Paso 4
QUALITY_MIN_RESOLUTION = 96  # Mínimo 96x96 px dentro del bbox
QUALITY_LAPLACIAN_THRESHOLD = 100.0  # Varianza Laplaciana mínima
QUALITY_MAX_RETRIES = 3  # Reintentos desde ESP32

# Paso 5: Similitud facial — §6.3.2.5
SIMILARITY_THRESHOLD = 0.82  # Similitud coseno mínima
COSINE_DISTANCE_THRESHOLD = 0.40  # Distancia coseno máxima (1 - similitud)

# Paso 6: Sin umbral numérico — validación temporal

# Paso 7: Sin umbral numérico — validación de estado

# Paso 8: Rate limiting — §6.3.3.1 Paso 8
COOLDOWN_SECONDS = 3  # Intervalo mínimo entre accesos del mismo usuario

# =============================================================================
# InceptionResnetV1 — §6.3.2.1, §6.3.2.2
# =============================================================================
EMBEDDING_DIM = 512  # Dimensión del embedding
EMBEDDING_PRETRAINED = "vggface2"  # Dataset de preentrenamiento
FACE_INPUT_SIZE = 160  # Tamaño de entrada de la red (160x160)

# =============================================================================
# Alertas y bloqueos — §6.3.3.2
# =============================================================================

# Bloqueo por spoofing — §6.3.3.2 SPOOFING_ATTEMPT
SPOOFING_BLOCK_SECONDS = 60  # Bloqueo del nodo por 60 s

# Brute force — §6.3.3.2 BRUTE_FORCE_DETECTED
BRUTE_FORCE_MAX_ATTEMPTS = 5  # Máximo intentos DENY
BRUTE_FORCE_WINDOW_SECONDS = 120  # Ventana de 120 s
BRUTE_FORCE_BLOCK_SECONDS = 300  # Bloqueo del nodo por 300 s

# Notificación diferida IDENTITY_MISMATCH — §6.3.3.2
IDENTITY_MISMATCH_SUMMARY_INTERVAL = 900  # Resumen cada 15 min (900 s)
IDENTITY_MISMATCH_SUMMARY_THRESHOLD = 3  # Si hay más de 3 eventos

# =============================================================================
# Severidad de eventos — §6.3.3.2
# =============================================================================
class Severity:
    CRITICO = "CRITICO"
    ALTO = "ALTO"
    MEDIO = "MEDIO"
    BAJO = "BAJO"
    INFO = "INFO"


class EventType:
    SPOOFING_ATTEMPT = "SPOOFING_ATTEMPT"
    BRUTE_FORCE_DETECTED = "BRUTE_FORCE_DETECTED"
    IDENTITY_MISMATCH = "IDENTITY_MISMATCH"
    ACCESS_OUT_OF_SCHEDULE = "ACCESS_OUT_OF_SCHEDULE"
    LOW_QUALITY_FRAME = "LOW_QUALITY_FRAME"
    USER_INACTIVE = "USER_INACTIVE"
    RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED"
    SUCCESSFUL_ACCESS = "SUCCESSFUL_ACCESS"
    NO_FACE_DETECTED = "NO_FACE_DETECTED"


class Decision:
    GRANT = "GRANT"
    DENY = "DENY"


# Mapeo evento → severidad — §6.3.3.2 Taxonomía
EVENT_SEVERITY_MAP = {
    EventType.SPOOFING_ATTEMPT: Severity.CRITICO,
    EventType.BRUTE_FORCE_DETECTED: Severity.CRITICO,
    EventType.IDENTITY_MISMATCH: Severity.ALTO,
    EventType.ACCESS_OUT_OF_SCHEDULE: Severity.ALTO,
    EventType.LOW_QUALITY_FRAME: Severity.MEDIO,
    EventType.USER_INACTIVE: Severity.MEDIO,
    EventType.RATE_LIMIT_EXCEEDED: Severity.BAJO,
    EventType.SUCCESSFUL_ACCESS: Severity.INFO,
    EventType.NO_FACE_DETECTED: Severity.ALTO,
}

# =============================================================================
# MQTT — §6.3.1 RF-IA-05, §6.3.3.2
# =============================================================================
MQTT_BROKER_HOST = os.environ.get("MQTT_BROKER_HOST", "localhost")
MQTT_BROKER_PORT = int(os.environ.get("MQTT_BROKER_PORT", "1883"))
MQTT_CLIENT_ID = "capa3_motor_ia"
MQTT_KEEPALIVE = 60

# Topics MQTT — Capa 2 specs
MQTT_TOPIC_COMANDO = "acceso/puerta/{node_id}/comando"
MQTT_TOPIC_ALERTAS = "sistema/alertas/{severidad}"
MQTT_TOPIC_HEARTBEAT = "sistema/nodos/{node_id}/heartbeat"
MQTT_TOPIC_RECONNECT = "sistema/nodos/{node_id}/reconnect"

# =============================================================================
# OFFLINE_EMERGENCY — §6.3.3.3
# =============================================================================
HEARTBEAT_INTERVAL_SECONDS = 30  # Cada nodo publica cada 30 s
HEARTBEAT_TIMEOUT_SECONDS = 90  # 3 periodos sin heartbeat → OFFLINE
HEARTBEAT_PING_RETRY_SECONDS = 15  # Reintentos de ping cada 15 s
HTTP_WATCHDOG_TIMEOUT_SECONDS = 5  # Timeout de confirmación HTTP
HTTP_WATCHDOG_MAX_TIMEOUTS = 3  # 3 timeouts → OFFLINE

# Estados de nodo — §6.3.3.3
class NodeState:
    ONLINE = "ONLINE"
    DEGRADADO = "DEGRADADO"
    OFFLINE = "OFFLINE"
    RECONECTADO = "RECONECTADO"


# =============================================================================
# API Flask
# =============================================================================
API_HOST = os.environ.get("API_HOST", "0.0.0.0")
API_PORT = int(os.environ.get("API_PORT", "5000"))
API_DEBUG = os.environ.get("API_DEBUG", "true").lower() == "true"
MAX_CONTENT_LENGTH = 100 * 1024  # 100 KB máximo (imágenes 20-80 KB)
