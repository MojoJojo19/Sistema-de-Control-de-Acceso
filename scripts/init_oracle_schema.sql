-- =============================================================================
-- DDL Oracle — §6.3.4.2 Diseño del Esquema de Tablas
-- Sistema de Control de Acceso Inteligente con Visión Biométrica
-- Universidad Nacional Mayor de San Marcos
-- =============================================================================

-- Tabla usuarios — §6.3.4.2
CREATE TABLE usuarios (
    id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre           VARCHAR2(200)       NOT NULL,
    email            VARCHAR2(200)       UNIQUE,
    embedding        BLOB                NOT NULL,
    estado           VARCHAR2(20)        DEFAULT 'ACTIVO'
                         CHECK (estado IN ('ACTIVO','BLOQUEADO','SUSPENDIDO')),
    horario_inicio   INTERVAL DAY TO SECOND,
    horario_fin      INTERVAL DAY TO SECOND,
    fecha_registro      TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP,
    fecha_actualizacion TIMESTAMP WITH TIME ZONE
);

-- Tabla nodos — §6.3.4.2
CREATE TABLE nodos (
    id               VARCHAR2(50)    PRIMARY KEY,
    nombre           VARCHAR2(200)   NOT NULL,
    ubicacion        VARCHAR2(300),
    estado           VARCHAR2(20)    DEFAULT 'ONLINE'
                         CHECK (estado IN ('ONLINE','OFFLINE','DEGRADADO')),
    ultimo_heartbeat TIMESTAMP WITH TIME ZONE,
    timeout_count    NUMBER          DEFAULT 0,
    fecha_registro   TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP
);

-- Tabla logs_acceso — §6.3.4.2 (inmutable)
CREATE TABLE logs_acceso (
    id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    timestamp_utc    TIMESTAMP WITH TIME ZONE NOT NULL,
    node_id          VARCHAR2(50)    REFERENCES nodos(id),
    user_id          NUMBER          REFERENCES usuarios(id),
    event_type       VARCHAR2(50)    NOT NULL,
    severity         VARCHAR2(20)    NOT NULL
                         CHECK (severity IN ('CRITICO','ALTO','MEDIO','BAJO','INFO')),
    decision         VARCHAR2(10)    NOT NULL CHECK (decision IN ('GRANT','DENY')),
    similarity_score NUMBER(5,4),
    liveness_score   NUMBER(5,4),
    sync_mode        NUMBER(1)       DEFAULT 0,
    embedding_blob   BLOB,
    evidence_image   BLOB,
    hmac_signature   VARCHAR2(64)    NOT NULL
);

-- Trigger de inmutabilidad — §6.3.4.3
CREATE OR REPLACE TRIGGER trg_logs_acceso_immutable
BEFORE UPDATE OR DELETE ON logs_acceso
FOR EACH ROW
BEGIN
    RAISE_APPLICATION_ERROR(-20001, 'Los registros de logs_acceso son inmutables.');
END;
/

-- Tabla sesiones — §6.3.4.2
CREATE TABLE sesiones (
    id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id          VARCHAR2(50)    REFERENCES nodos(id),
    user_id          NUMBER          REFERENCES usuarios(id),
    token            VARCHAR2(128)   UNIQUE NOT NULL,
    timestamp_grant  TIMESTAMP WITH TIME ZONE NOT NULL,
    timestamp_cierre TIMESTAMP WITH TIME ZONE,
    log_id           NUMBER          REFERENCES logs_acceso(id)
);

-- Índices para rendimiento
CREATE INDEX idx_logs_timestamp ON logs_acceso(timestamp_utc);
CREATE INDEX idx_logs_node ON logs_acceso(node_id);
CREATE INDEX idx_logs_user ON logs_acceso(user_id);
CREATE INDEX idx_logs_event ON logs_acceso(event_type);
CREATE INDEX idx_logs_severity ON logs_acceso(severity);
CREATE INDEX idx_sesiones_user ON sesiones(user_id);
CREATE INDEX idx_sesiones_node ON sesiones(node_id);
CREATE INDEX idx_usuarios_estado ON usuarios(estado);
