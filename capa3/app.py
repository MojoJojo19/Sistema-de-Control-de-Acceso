"""
Entry Point — Capa 3 Server

Inicializa todos los componentes del Motor de IA y arranca
el servidor Flask.

Uso:
    python -m capa3.app
"""

import logging
import sys
from pathlib import Path

# Permitir ejecución directa del script (python capa3/app.py) agregando la raíz al PYTHONPATH
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
from flask import Flask

from capa3.config import API_DEBUG, API_HOST, API_PORT, MAX_CONTENT_LENGTH
from capa3.models.faiss_index import FAISSIndex
from capa3.pipeline.engine import IAEngine
from capa3.business.alerts import AlertManager
from capa3.business.rate_limiter import RateLimiter
from capa3.business.decision_chain import DecisionChain
from capa3.business.node_monitor import NodeMonitor
from capa3.mqtt.publisher import MQTTPublisher
from capa3.persistence.database import get_session_factory
from capa3.persistence.init_db import init_database, load_faiss_index_from_db
from capa3.api.routes import api_bp

# Configurar logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def create_app() -> Flask:
    """
    Factory de la aplicación Flask.
    
    Inicializa:
        1. Base de datos (SQLite/Oracle)
        2. Índice FAISS (cargado desde BD)
        3. Motor de IA (FaceMesh, MiniFASNet, MTCNN, InceptionResnetV1)
        4. Lógica de negocio (cadena fail-fast, alertas, rate limiter)
        5. MQTT publisher
        6. Rutas API
    """
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH

    logger.info("=" * 60)
    logger.info("Iniciando Capa 3 — Motor de IA Centralizado")
    logger.info("=" * 60)

    # 1. Base de datos
    logger.info("[1/6] Inicializando base de datos...")
    init_database()

    # 2. FAISS Index
    logger.info("[2/6] Cargando índice FAISS...")
    faiss_index = FAISSIndex()
    loaded = load_faiss_index_from_db(faiss_index)
    logger.info("  → %d embeddings cargados en FAISS", loaded)

    # 3. Motor de IA
    logger.info("[3/6] Inicializando Motor de IA...")
    ia_engine = IAEngine(faiss_index)

    # 4. Lógica de negocio
    logger.info("[4/6] Inicializando lógica de negocio...")
    alert_manager = AlertManager()
    rate_limiter = RateLimiter()
    node_monitor = NodeMonitor()
    node_monitor.register_node("ESP32-S3-PUERTA-01")

    decision_chain = DecisionChain(
        rate_limiter=rate_limiter,
        alert_manager=alert_manager,
        db_session_factory=get_session_factory(),
    )

    # 5. MQTT
    logger.info("[5/6] Inicializando MQTT publisher...")
    mqtt_publisher = MQTTPublisher()

    # 6. Registrar componentes en app
    logger.info("[6/6] Registrando rutas API...")
    app.config["ia_engine"] = ia_engine
    app.config["decision_chain"] = decision_chain
    app.config["mqtt_publisher"] = mqtt_publisher
    app.config["rate_limiter"] = rate_limiter
    app.config["node_monitor"] = node_monitor
    app.config["alert_manager"] = alert_manager

    app.register_blueprint(api_bp)

    logger.info("=" * 60)
    logger.info("Capa 3 lista — Endpoints disponibles:")
    logger.info("  POST /api/v1/recognize  (reconocimiento facial)")
    logger.info("  POST /api/v1/enroll     (enrollment de usuario)")
    logger.info("  GET  /api/v1/sync/logs  (resincronización)")
    logger.info("  GET  /api/v1/health     (estado del servidor)")
    logger.info("=" * 60)

    return app


def main():
    """Arranca el servidor Flask."""
    app = create_app()
    app.run(
        host=API_HOST,
        port=API_PORT,
        debug=API_DEBUG,
    )


if __name__ == "__main__":
    main()
