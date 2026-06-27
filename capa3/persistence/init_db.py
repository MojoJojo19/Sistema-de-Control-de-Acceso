"""
Inicialización de Base de Datos — §6.3.4

Crea tablas, inserta datos iniciales de prueba,
y carga embeddings en el índice FAISS.
"""

import logging
from datetime import datetime, timezone, time
from pathlib import Path

import numpy as np

from capa3.config import BASE_DIR
from capa3.persistence.database import get_engine, get_session
from capa3.persistence.models_db import Base, Usuario, Nodo

logger = logging.getLogger(__name__)


def create_tables() -> None:
    """Crea todas las tablas en la base de datos."""
    engine = get_engine()
    Base.metadata.create_all(engine)
    logger.info("Tablas creadas exitosamente")


def insert_default_node(node_id: str = "ESP32-S3-PUERTA-01") -> None:
    """Inserta un nodo de prueba si no existe."""
    session = get_session()
    try:
        existing = session.query(Nodo).filter_by(id=node_id).first()
        if existing is None:
            nodo = Nodo(
                id=node_id,
                nombre="Puerta Principal",
                ubicacion="Entrada principal del edificio",
                estado="ONLINE",
                ultimo_heartbeat=datetime.now(timezone.utc),
                timeout_count=0,
            )
            session.add(nodo)
            session.commit()
            logger.info("Nodo de prueba insertado: %s", node_id)
        else:
            logger.debug("Nodo %s ya existe", node_id)
    except Exception as e:
        session.rollback()
        logger.error("Error insertando nodo: %s", e)
    finally:
        session.close()


def enroll_user_from_images(
    nombre: str,
    image_paths: list[str],
    email: str | None = None,
    horario_inicio: time | None = None,
    horario_fin: time | None = None,
) -> int | None:
    """
    Registra un usuario con enrollment de imágenes.
    
    §6.3.2.3: 3-5 fotos → MTCNN crop → InceptionResnetV1 →
    promedio de embeddings normalizado → BD.

    Args:
        nombre: Nombre del usuario.
        image_paths: Lista de rutas a imágenes faciales (3-5 fotos).
        email: Email del usuario (opcional).
        horario_inicio: Hora de inicio de acceso permitido.
        horario_fin: Hora de fin de acceso permitido.

    Returns:
        ID del usuario creado, o None si falló.
    """
    from capa3.models.detector import FaceDetector
    from capa3.models.embedder import FaceEmbedder
    from capa3.pipeline.preprocessor import load_image_file
    import torch

    detector = FaceDetector()
    embedder = FaceEmbedder()

    face_crops = []
    for img_path in image_paths:
        image_rgb = load_image_file(img_path)
        if image_rgb is None:
            logger.warning("No se pudo cargar: %s", img_path)
            continue

        detection = detector.detect(image_rgb)
        if not detection.detected:
            logger.warning("No se detectó rostro en: %s", img_path)
            continue

        face_crops.append(detection.face_crop)

    if len(face_crops) == 0:
        logger.error("No se detectaron rostros en ninguna imagen para %s", nombre)
        return None

    # Extraer embedding promediado — §6.3.2.3
    mean_embedding = embedder.extract_from_images(face_crops)

    # Almacenar en BD
    session = get_session()
    try:
        usuario = Usuario(
            nombre=nombre,
            email=email,
            embedding=mean_embedding.tobytes(),
            estado="ACTIVO",
            horario_inicio=horario_inicio,
            horario_fin=horario_fin,
        )
        session.add(usuario)
        session.commit()

        user_id = usuario.id
        logger.info(
            "Usuario enrollado: id=%d, nombre='%s', imágenes=%d/%d",
            user_id,
            nombre,
            len(face_crops),
            len(image_paths),
        )
        return user_id
    except Exception as e:
        session.rollback()
        logger.error("Error enrollando usuario '%s': %s", nombre, e)
        return None
    finally:
        session.close()


def load_faiss_index_from_db(faiss_index) -> int:
    """
    Carga todos los embeddings de la BD al índice FAISS.

    Args:
        faiss_index: Instancia de FAISSIndex.

    Returns:
        Cantidad de embeddings cargados.
    """
    session = get_session()
    try:
        users = session.query(Usuario).filter_by(estado="ACTIVO").all()
        embeddings = []
        user_ids = []

        for user in users:
            emb = np.frombuffer(user.embedding, dtype=np.float32)
            if emb.shape[0] == 512:
                embeddings.append(emb)
                user_ids.append(user.id)
            else:
                logger.warning(
                    "Embedding inválido para usuario %d: shape=%s",
                    user.id,
                    emb.shape,
                )

        faiss_index.rebuild_from_data(embeddings, user_ids)
        logger.info(
            "FAISS índice cargado: %d embeddings de %d usuarios activos",
            len(embeddings),
            len(users),
        )
        return len(embeddings)
    except Exception as e:
        logger.error("Error cargando FAISS desde BD: %s", e)
        return 0
    finally:
        session.close()


def init_database() -> None:
    """Inicialización completa de la base de datos."""
    create_tables()
    insert_default_node()
    logger.info("Base de datos inicializada")
