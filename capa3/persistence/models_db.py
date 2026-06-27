"""
ORM Models — §6.3.4.2 Diseño del Esquema de Tablas

4 tablas definidas exactamente como el spec SQL:
    - Usuario: id, nombre, email, embedding (BLOB), estado, horarios
    - Nodo: id, nombre, ubicación, estado, heartbeat, timeout_count
    - LogAcceso: inmutable, hmac_signature, sync_mode, evidence_image
    - Sesion: token, timestamps, FK a log
"""

import logging
from datetime import datetime, timezone, time

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    LargeBinary,
    DateTime,
    Boolean,
    ForeignKey,
    CheckConstraint,
    Time,
    event,
)
from sqlalchemy.orm import declarative_base, relationship

logger = logging.getLogger(__name__)

Base = declarative_base()


class Usuario(Base):
    """
    Tabla usuarios — §6.3.4.2
    
    Almacena identidades registradas con su embedding facial.
    """
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, autoincrement=True)
    nombre = Column(String(200), nullable=False)
    email = Column(String(200), unique=True, nullable=True)
    embedding = Column(LargeBinary, nullable=False)  # Vector float32 512-dim serializado
    estado = Column(
        String(20),
        default="ACTIVO",
        nullable=False,
    )
    horario_inicio = Column(Time, nullable=True)  # e.g., 07:00:00
    horario_fin = Column(Time, nullable=True)  # e.g., 20:00:00
    fecha_registro = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    fecha_actualizacion = Column(DateTime(timezone=True), nullable=True)

    # Relaciones
    logs = relationship("LogAcceso", back_populates="usuario")
    sesiones = relationship("Sesion", back_populates="usuario")

    __table_args__ = (
        CheckConstraint(
            "estado IN ('ACTIVO', 'BLOQUEADO', 'SUSPENDIDO')",
            name="chk_usuario_estado",
        ),
    )

    def __repr__(self):
        return f"<Usuario(id={self.id}, nombre='{self.nombre}', estado='{self.estado}')>"


class Nodo(Base):
    """
    Tabla nodos — §6.3.4.2
    
    Registra cada nodo ESP32-S3 con su estado de conectividad.
    """
    __tablename__ = "nodos"

    id = Column(String(50), primary_key=True)  # e.g., 'ESP32-S3-PUERTA-01'
    nombre = Column(String(200), nullable=False)
    ubicacion = Column(String(300), nullable=True)
    estado = Column(
        String(20),
        default="ONLINE",
        nullable=False,
    )
    ultimo_heartbeat = Column(DateTime(timezone=True), nullable=True)
    timeout_count = Column(Integer, default=0)
    fecha_registro = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )

    # Relaciones
    logs = relationship("LogAcceso", back_populates="nodo")
    sesiones = relationship("Sesion", back_populates="nodo")

    __table_args__ = (
        CheckConstraint(
            "estado IN ('ONLINE', 'OFFLINE', 'DEGRADADO')",
            name="chk_nodo_estado",
        ),
    )

    def __repr__(self):
        return f"<Nodo(id='{self.id}', nombre='{self.nombre}', estado='{self.estado}')>"


class LogAcceso(Base):
    """
    Tabla logs_acceso — §6.3.4.2
    
    Registro inmutable de cada intento de acceso.
    Cada registro incluye firma HMAC-SHA256 para integridad.
    
    §6.3.4.3: Los registros NO deben ser modificados después de escritos.
    (Trigger en Oracle; en SQLite se refuerza a nivel de aplicación.)
    """
    __tablename__ = "logs_acceso"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp_utc = Column(DateTime(timezone=True), nullable=False)
    node_id = Column(String(50), ForeignKey("nodos.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    event_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    decision = Column(String(10), nullable=False)
    similarity_score = Column(Float, nullable=True)
    liveness_score = Column(Float, nullable=True)
    sync_mode = Column(Integer, default=0)  # 0=tiempo real, 1=offline sync
    embedding_blob = Column(LargeBinary, nullable=True)  # Embedding intento fallido
    evidence_image = Column(LargeBinary, nullable=True)  # Frame JPEG evidencia
    hmac_signature = Column(String(64), nullable=False)

    # Relaciones
    nodo = relationship("Nodo", back_populates="logs")
    usuario = relationship("Usuario", back_populates="logs")
    sesion = relationship("Sesion", back_populates="log_acceso", uselist=False)

    __table_args__ = (
        CheckConstraint(
            "severity IN ('CRITICO', 'ALTO', 'MEDIO', 'BAJO', 'INFO')",
            name="chk_log_severity",
        ),
        CheckConstraint(
            "decision IN ('GRANT', 'DENY')",
            name="chk_log_decision",
        ),
    )

    def __repr__(self):
        return (
            f"<LogAcceso(id={self.id}, event={self.event_type}, "
            f"decision={self.decision}, user={self.user_id})>"
        )


class Sesion(Base):
    """
    Tabla sesiones — §6.3.4.2
    
    Registra sesiones activas de acceso concedido.
    """
    __tablename__ = "sesiones"

    id = Column(Integer, primary_key=True, autoincrement=True)
    node_id = Column(String(50), ForeignKey("nodos.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    token = Column(String(128), unique=True, nullable=False)
    timestamp_grant = Column(DateTime(timezone=True), nullable=False)
    timestamp_cierre = Column(DateTime(timezone=True), nullable=True)
    log_id = Column(Integer, ForeignKey("logs_acceso.id"), nullable=True)

    # Relaciones
    nodo = relationship("Nodo", back_populates="sesiones")
    usuario = relationship("Usuario", back_populates="sesiones")
    log_acceso = relationship("LogAcceso", back_populates="sesion")

    def __repr__(self):
        return f"<Sesion(id={self.id}, user={self.user_id}, token='{self.token[:8]}...')>"
