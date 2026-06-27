"""
API REST Flask — §6.3.1 RF-IA-01

Endpoints:
    POST /api/v1/recognize  → Recibe imagen JPEG + node_id, ejecuta pipeline
    POST /api/v1/enroll     → Enrollment de usuario (imágenes)
    GET  /api/v1/sync/logs  → Resincronización post-reconexión
    GET  /api/v1/health     → Estado del servidor
"""

import logging
import time
from datetime import datetime, timezone

import numpy as np
from flask import Blueprint, request, jsonify, current_app
import jwt
from datetime import timedelta

from capa3.config import Decision, EventType, MAX_CONTENT_LENGTH, JWT_SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRATION_HOURS
from capa3.persistence.hmac_utils import calcular_hmac
from capa3.persistence.models_db import LogAcceso, Sesion, Usuario
from capa3.persistence.database import get_session

logger = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__, url_prefix="/api/v1")


@api_bp.route("/recognize", methods=["POST"])
def recognize():
    """
    POST /api/v1/recognize — §6.3.1 RF-IA-01
    
    Recibe imagen JPEG (20-80 KB) + node_id.
    Ejecuta el pipeline completo de reconocimiento.
    Retorna decisión GRANT/DENY con scores y motivo.
    """
    engine = current_app.config["ia_engine"]
    decision_chain = current_app.config["decision_chain"]
    mqtt_publisher = current_app.config["mqtt_publisher"]
    rate_limiter = current_app.config["rate_limiter"]

    # Validar request
    if "image" not in request.files and not request.data:
        return jsonify({"error": "No se recibió imagen"}), 400

    node_id = request.form.get("node_id", request.args.get("node_id", "unknown"))

    # Verificar si el nodo está bloqueado
    node_check = rate_limiter.check_node_blocked(node_id)
    if not node_check.allowed:
        return jsonify({
            "decision": Decision.DENY,
            "event_type": EventType.BRUTE_FORCE_DETECTED,
            "reason": node_check.reason,
        }), 403

    # Obtener bytes de la imagen
    if "image" in request.files:
        jpeg_bytes = request.files["image"].read()
    else:
        jpeg_bytes = request.data

    if len(jpeg_bytes) == 0:
        return jsonify({"error": "Imagen vacía"}), 400

    if len(jpeg_bytes) > MAX_CONTENT_LENGTH:
        return jsonify({
            "error": f"Imagen excede {MAX_CONTENT_LENGTH // 1024} KB"
        }), 413

    # Ejecutar pipeline de IA (pasos 1-7)
    pipeline_result = engine.process(jpeg_bytes, node_id)

    # Ejecutar cadena de decisión (pasos 6-8 de negocio)
    access_decision = decision_chain.evaluate(pipeline_result, node_id)

    # Persistir en BD — §6.3.4
    _persist_log(access_decision, node_id)

    # Publicar MQTT — §6.3.1 RF-IA-05
    mqtt_publisher.publish_decision(
        node_id=node_id,
        decision=access_decision.decision,
        session_token=access_decision.session_token,
        user_id=access_decision.user_id,
        similarity_score=access_decision.similarity_score,
    )

    if access_decision.alert and access_decision.alert.requires_notification:
        mqtt_publisher.publish_alert(
            severity=access_decision.severity,
            event_type=access_decision.event_type,
            node_id=node_id,
        )

    # Construir respuesta
    response = {
        "decision": access_decision.decision,
        "event_type": access_decision.event_type,
        "severity": access_decision.severity,
        "user_id": access_decision.user_id,
        "similarity_score": round(access_decision.similarity_score, 4),
        "liveness_score": round(access_decision.liveness_score, 3),
        "reason": access_decision.reason,
        "pipeline_ms": round(pipeline_result.total_ms, 1),
        "timings": {
            t.step_name: round(t.duration_ms, 1)
            for t in pipeline_result.timings
        },
    }

    if access_decision.session_token:
        response["session_token"] = access_decision.session_token

    status_code = 200 if access_decision.decision == Decision.GRANT else 403
    return jsonify(response), status_code


@api_bp.route("/enroll", methods=["POST"])
def enroll():
    """
    POST /api/v1/enroll — Enrollment de usuario
    
    §6.3.2.3: 3-5 fotos → embedding promediado → BD + FAISS.
    
    Form data:
        nombre: str (requerido)
        email: str (opcional)
        images: múltiples archivos de imagen
    """
    engine = current_app.config["ia_engine"]

    nombre = request.form.get("nombre")
    if not nombre:
        return jsonify({"error": "Nombre requerido"}), 400

    email = request.form.get("email")
    images = request.files.getlist("images")

    if len(images) < 1:
        return jsonify({"error": "Se requiere al menos 1 imagen (recomendado 3-5)"}), 400

    # Detectar y extraer face crops
    face_crops = []
    errors = []
    for i, img_file in enumerate(images):
        img_bytes = img_file.read()
        from capa3.pipeline.preprocessor import decode_image
        image_rgb = decode_image(img_bytes)
        if image_rgb is None:
            errors.append(f"Imagen {i+1}: error de decodificación")
            continue

        detection = engine.detector.detect(image_rgb)
        if not detection.detected:
            errors.append(f"Imagen {i+1}: no se detectó rostro")
            continue

        face_crops.append(detection.face_crop)

    if len(face_crops) == 0:
        return jsonify({
            "error": "No se detectaron rostros en ninguna imagen",
            "details": errors,
        }), 400

    # Extraer embedding promediado — §6.3.2.3
    mean_embedding = engine.embedder.extract_from_images(face_crops)

    # Almacenar en BD
    session = get_session()
    try:
        from capa3.persistence.models_db import Usuario
        usuario = Usuario(
            nombre=nombre,
            email=email,
            embedding=mean_embedding.tobytes(),
            estado="ACTIVO",
        )
        session.add(usuario)
        session.commit()
        user_id = usuario.id

        # Agregar al índice FAISS
        engine.faiss_index.add(mean_embedding, user_id)

        return jsonify({
            "success": True,
            "user_id": user_id,
            "nombre": nombre,
            "images_processed": len(face_crops),
            "images_total": len(images),
            "errors": errors if errors else None,
        }), 201

    except Exception as e:
        session.rollback()
        logger.error("Error en enrollment: %s", e)
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@api_bp.route("/sync/logs", methods=["GET"])
def sync_logs():
    """
    GET /api/v1/sync/logs?from={timestamp} — §6.3.3.3 Resincronización
    
    Retorna logs pendientes de sincronización para un nodo reconectado.
    """
    from_ts = request.args.get("from")
    node_id = request.args.get("node_id")

    if not from_ts or not node_id:
        return jsonify({"error": "Parámetros 'from' y 'node_id' requeridos"}), 400

    node_monitor = current_app.config.get("node_monitor")
    if node_monitor:
        pending = node_monitor.get_pending_sync(node_id)
        return jsonify({
            "node_id": node_id,
            "pending_count": len(pending),
            "events": pending,
        })

    return jsonify({"node_id": node_id, "pending_count": 0, "events": []})


@api_bp.route("/health", methods=["GET"])
def health():
    """GET /api/v1/health — Estado del servidor."""
    engine = current_app.config.get("ia_engine")
    faiss_total = engine.faiss_index.total_embeddings if engine else 0

    return jsonify({
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "models_loaded": engine is not None,
        "faiss_embeddings": faiss_total,
    })


# ==============================================================================
# Endpoints de Autenticación (JWT y Mosquitto) — Capa 2
# ==============================================================================

@api_bp.route("/auth/token", methods=["POST"])
def generate_token():
    """
    Genera un token JWT para un nodo (Capa 1) o cliente dashboard (Capa 4).
    En producción esto requeriría autenticación previa (ej. clave de API, admin login).
    """
    node_id = request.json.get("node_id") if request.is_json else request.form.get("node_id")
    if not node_id:
        return jsonify({"error": "node_id requerido"}), 400

    payload = {
        "sub": node_id,
        "role": "node" if node_id.startswith("ESP32") else "dashboard",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return jsonify({"token": token, "node_id": node_id, "expires_in_hours": JWT_EXPIRATION_HOURS})


@api_bp.route("/auth/mqtt", methods=["GET", "POST"])
def mqtt_auth():
    """
    Validación de usuario/password para Mosquitto go-auth.
    El cliente MQTT envía username (node_id) y password (token JWT).
    """
    # mosquitto-go-auth envía JSON en POST por defecto
    data = request.json if request.is_json else request.form
    username = data.get("username")
    password = data.get("password")  # Esto debe ser el JWT

    if not username or not password:
        # Permitir un superusuario interno de la capa 3 (el propio backend Python)
        if username == "capa3_motor_ia" and password == "internal_backend_secret":
            return "OK", 200
        return "Missing credentials", 401

    try:
        decoded = jwt.decode(password, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        if decoded.get("sub") == username:
            return "OK", 200
        else:
            return "Token subject mismatch", 401
    except jwt.ExpiredSignatureError:
        return "Token expired", 401
    except jwt.InvalidTokenError:
        return "Invalid token", 401


@api_bp.route("/auth/mqtt/superuser", methods=["GET", "POST"])
def mqtt_superuser():
    """Valida si un usuario de MQTT es superusuario."""
    data = request.json if request.is_json else request.form
    username = data.get("username")
    
    if username == "capa3_motor_ia":
        return "OK", 200
    
    # dashboard admin (si quisiéramos)
    if username == "dashboard_admin":
        return "OK", 200
        
    return "Not superuser", 401


@api_bp.route("/auth/mqtt/acl", methods=["GET", "POST"])
def mqtt_acl():
    """
    Control de acceso a nivel de topic (ACL) para Mosquitto.
    """
    data = request.json if request.is_json else request.form
    username = data.get("username")
    topic = data.get("topic")
    acc = str(data.get("acc")) # 1=sub, 2=pub, 3=both
    
    # El superusuario (backend Python) y Dashboard admin tienen acceso a todo
    if username in ["capa3_motor_ia", "dashboard_admin"]:
        return "OK", 200
        
    # Validaciones para nodos (ESP32)
    if username and username.startswith("ESP32"):
        if acc == "2": # Publicación
            # Los nodos publican en heartbeat y reconnect
            if topic == f"sistema/nodos/{username}/heartbeat" or topic == f"sistema/nodos/{username}/reconnect":
                return "OK", 200
        elif acc == "1": # Suscripción
            # Los nodos se suscriben a comandos
            if topic == f"acceso/puerta/{username}/comando":
                return "OK", 200
                
    return "ACL denied", 401


def _persist_log(access_decision, node_id: str) -> None:
    """Persiste el resultado en la tabla logs_acceso — §6.3.4."""
    session = get_session()
    try:
        timestamp = datetime.now(timezone.utc)
        pipeline = access_decision.pipeline_result

        # Calcular HMAC — §6.3.4.3
        log_dict = {
            "timestamp_utc": timestamp.isoformat(),
            "node_id": node_id,
            "user_id": access_decision.user_id,
            "event_type": access_decision.event_type,
            "decision": access_decision.decision,
            "similarity_score": access_decision.similarity_score,
        }
        hmac_sig = calcular_hmac(log_dict)

        # Crear registro
        log = LogAcceso(
            timestamp_utc=timestamp,
            node_id=node_id,
            user_id=access_decision.user_id,
            event_type=access_decision.event_type,
            severity=access_decision.severity,
            decision=access_decision.decision,
            similarity_score=access_decision.similarity_score,
            liveness_score=access_decision.liveness_score,
            sync_mode=0,  # Tiempo real
            embedding_blob=(
                pipeline.embedding.tobytes()
                if pipeline.embedding is not None
                and access_decision.event_type == EventType.IDENTITY_MISMATCH
                else None
            ),
            evidence_image=(
                pipeline.evidence_image
                if access_decision.event_type == EventType.SPOOFING_ATTEMPT
                else None
            ),
            hmac_signature=hmac_sig,
        )
        session.add(log)

        # Si GRANT, crear sesión — §6.3.4.2
        if access_decision.decision == Decision.GRANT and access_decision.session_token:
            sesion = Sesion(
                node_id=node_id,
                user_id=access_decision.user_id,
                token=access_decision.session_token,
                timestamp_grant=timestamp,
                log_id=log.id,
            )
            session.add(sesion)

        session.commit()
        logger.debug("Log persistido: event=%s, decision=%s", 
                     access_decision.event_type, access_decision.decision)

    except Exception as e:
        session.rollback()
        logger.error("Error persistiendo log: %s", e)
    finally:
        session.close()
