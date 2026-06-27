# 🧠 Specs de Software — Capa 3: Capa de Apoyo a Servicios

> **Proyecto:** Sistema de Control de Acceso Inteligente con Visión Biométrica  
> **Universidad:** Universidad Nacional Mayor de San Marcos  
> **Capa analizada:** Capa 3 — Capa de Apoyo a Servicios (`sección 6.3` del documento)

> [!NOTE]
> Las secciones marcadas con ⚠️ **están declaradas en el índice del PDF pero no tienen contenido desarrollado**. Se documentan como requisitos que el equipo debe definir e implementar.

---

## 🗂️ Estructura de la Capa

```
Capa 3 — Apoyo a Servicios
├── 6.3.1  Motor de IA Centralizado
│   ├── Framework de Inferencia          ⚠️ pendiente de definir
│   ├── Pipeline de Procesamiento        ⚠️ pendiente de definir
│   └── Métricas de Rendimiento          ⚠️ pendiente de definir
├── 6.3.2  Modelo de Reconocimiento Facial
│   ├── Selección del Modelo             ⚠️ pendiente de definir
│   ├── Arquitectura de la Red Neuronal  ⚠️ pendiente de definir
│   ├── Entrenamiento y Dataset          ⚠️ pendiente de definir
│   ├── Liveness Detection / Anti-Spoofing ⚠️ pendiente de definir
│   └── Métricas de Evaluación           ⚠️ pendiente de definir
├── 6.3.3  Lógica de Negocio y Gestión de Reglas de Acceso  ✅ definida
│   ├── 6.3.3.1  Cadena de Decisión (8 pasos)
│   ├── 6.3.3.2  Gestión de Excepciones y Alertas
│   └── 6.3.3.3  Modo OFFLINE_EMERGENCY (lado servidor)
└── 6.3.4  Persistencia de Datos Relacionales
    ├── Motor de Base de Datos           ⚠️ pendiente de definir
    ├── Diseño del Esquema de Tablas     ⚠️ pendiente de definir
    ├── Logs Inmutables e Integridad     ⚠️ pendiente de definir
    └── Política de Retención y Backup   ⚠️ pendiente de definir
```

---

## 6.3.1 Motor de Inteligencia Artificial Centralizado

> [!IMPORTANT]
> Esta sección está declarada en el índice pero **no tiene contenido en el PDF**. Los siguientes requisitos se derivan del contexto general del documento.

### Requisitos funcionales del Motor de IA

| Requisito | Descripción |
|---|---|
| **RF-IA-01** | Recibir imagen JPEG (20–80 KB) via HTTP POST `/api/v1/recognize` |
| **RF-IA-02** | Ejecutar **Liveness Detection** (Anti-Spoofing) antes de cualquier otra operación |
| **RF-IA-03** | Ejecutar reconocimiento facial comparando contra embeddings en base de datos |
| **RF-IA-04** | Retornar resultado binario (`GRANT` / `DENY`) con score de similitud y motivo |
| **RF-IA-05** | Publicar la decisión via MQTT al topic `acceso/puerta/{id}/comando` |
| **RF-IA-06** | Almacenar el embedding del intento fallido (en caso de `IDENTITY_MISMATCH`) |

### 6.3.1.1 Framework de Inferencia ⚠️

> **A definir por el equipo.** Preguntas clave:
> - ¿Se usará **TensorFlow / PyTorch / ONNX Runtime**?
> - ¿El servidor es CPU-only o tiene GPU disponible?
> - ¿Se requiere cuantización del modelo para la PC local?

### 6.3.1.2 Pipeline de Procesamiento ⚠️

> **A definir por el equipo.** El flujo esperado es:

```
Imagen JPEG recibida
    → Decodificación y preprocesamiento (resize, normalización)
    → Liveness Detection (Anti-Spoofing)
    → Detección de rostro en frame
    → Verificación de calidad del frame (resolución + nitidez)
    → Extracción de embedding facial
    → Comparación coseno contra BD de embeddings
    → Validación de horario y estado del usuario
    → Decisión GRANT / DENY
    → Publicación MQTT + escritura en logs_acceso
```

### 6.3.1.3 Métricas de Rendimiento del Motor ⚠️

> **A definir por el equipo.** Objetivo sugerido basado en el documento:

| Métrica | Objetivo |
|---|---|
| Latencia total del pipeline | < 500 ms end-to-end (incluyendo red) |
| Tiempo de inferencia Liveness | A definir (sugerido < 100 ms) |
| Tiempo de extracción de embedding | A definir (sugerido < 150 ms) |
| Tiempo de comparación en BD | A definir (sugerido < 50 ms) |

---

## 6.3.2 Red Neuronal — Modelo de Reconocimiento Facial

> [!IMPORTANT]
> Esta sección está declarada en el índice pero **no tiene contenido en el PDF**. Los siguientes requisitos se derivan del contexto del documento.

### 6.3.2.1 Selección del Modelo ⚠️

> **A definir por el equipo.** Candidatos sugeridos (inferibles del contexto):
> - **FaceNet** (embeddings de 128/512 dimensiones)
> - **ArcFace / InsightFace** (alta precisión en verificación facial)
> - **MobileFaceNet** (ligero para PC local sin GPU)

### 6.3.2.2 Arquitectura de la Red Neuronal ⚠️

> **A definir por el equipo.**

### 6.3.2.3 Entrenamiento y Dataset ⚠️

> **A definir por el equipo.** El documento menciona que el sistema soporta registro de nuevos usuarios con sus embeddings almacenados en BD.

### 6.3.2.4 Liveness Detection / Anti-Spoofing ⚠️

> **A definir por el equipo.** Requisitos definidos en el documento:

| Parámetro | Valor |
|---|---|
| **Umbral de score de vivacidad** | ≥ **0.85** |
| Si score < 0.85 | `DENY` inmediato + alerta `SPOOFING_ATTEMPT` sin procesar imagen con el modelo facial |
| Frame como evidencia | Se captura y almacena en BD al detectar spoofing |

### 6.3.2.5 Métricas de Evaluación del Modelo ⚠️

> **A definir por el equipo.** El documento menciona:

| Métrica | Descripción |
|---|---|
| **FAR** (False Acceptance Rate) | Tasa de falsa aceptación — principal riesgo de seguridad |
| **FRR** (False Rejection Rate) | Tasa de falso rechazo — fricci\u00f3n para el usuario legítimo |
| Umbral de similitud elegido (0.82) | Prioriza minimizar FAR (seguridad) sobre FRR (experiencia) |

---

## 6.3.3 Lógica de Negocio y Gestión de Reglas de Acceso ✅

> Este es el módulo **intermediario** entre el Motor de IA y la Capa de Aplicación.  
> Traduce los resultados probabilísticos del modelo en decisiones binarias (`GRANT` / `DENY`).

### 6.3.3.1 Cadena de Decisión — Patrón Fail-Fast (8 Pasos)

> [!IMPORTANT]
> Cada paso actúa como **filtro secuencial**. Si una condición falla, el proceso termina inmediatamente con `DENY` **sin evaluar los pasos siguientes**. Esto minimiza tiempo de respuesta y carga computacional.

| Paso | Validación | Componente | Umbral / Condición | Resultado si falla |
|---|---|---|---|---|
| **1** | Score de vivacidad | Liveness Detection (Anti-Spoofing) | Score ≥ **0.85** | `DENY` + alerta `SPOOFING_ATTEMPT`. El frame NO se procesa con el modelo facial. Nodo bloqueado 60 s. |
| **2** | Detección de rostro en frame | Motor de detección facial | Confianza de detección ≥ **0.90** | `DENY` + log `NO_FACE_DETECTED`. Puede indicar obstrucción deliberada o iluminación adversa. |
| **3** | Calidad del frame biométrico | Análisis de calidad | Resolución mín. **96×96 px** + nitidez ≥ umbral Laplaciano | `DENY` + log `LOW_QUALITY_FRAME`. ESP32-S3 reintenta captura hasta **3 veces**. |
| **4** | Similitud facial con identidad registrada | Motor de comparación de embeddings | Distancia coseno ≤ **0.40** (equivalente a similitud ≥ **0.82**) | `DENY` + log `IDENTITY_MISMATCH`. Se registra embedding del intento fallido en BD. |
| **5** | Validación de horario permitido | Módulo de reglas temporales | Timestamp UTC dentro del rango horario asignado al usuario | `DENY` + log `ACCESS_OUT_OF_SCHEDULE`. No implica identidad no reconocida. |
| **6** | Validación de estado del usuario | Consulta a BD | Estado en BD = `ACTIVO` (no bloqueado, no suspendido) | `DENY` + log `USER_INACTIVE`. Notificación inmediata al administrador. |
| **7** | Cooldown entre intentos | Rate limiter | Intervalo mínimo de **3 s** entre accesos del mismo usuario | `DENY` + log `RATE_LIMIT_EXCEEDED`. Previene ataques de repetición de frames. |
| **8** | ✅ Todos los umbrales superados | — | Todas las validaciones cumplidas en secuencia | `GRANT` → publica en topic MQTT `acceso/puerta/{id}/comando` con payload `GRANT` + token de sesión. |

#### Calibración de umbrales

| Umbral | Valor | Justificación |
|---|---|---|
| Similitud facial | **0.82** | Minimiza FAR (riesgo de seguridad) con sacrificio marginal de FRR (fricción de usuario) |
| Liveness score | **0.85** | Umbral agresivo para prevenir ataques de spoofing físico |
| Confianza de detección | **0.90** | Alta confianza requerida para evitar falsos positivos en detección |
| Cooldown | **3 s** | Previene replay attacks sin afectar flujo de usuario legítimo |
| Reintentos de calidad | **3 veces** | Tolerancia a condiciones adversas de iluminación antes de denegar |

---

### 6.3.3.2 Gestión de Excepciones y Alertas

#### Taxonomía de Severidad

| Severidad | Código de Evento | Condición de Activación | Acción del Sistema |
|---|---|---|---|
| 🔴 **CRÍTICO** | `SPOOFING_ATTEMPT` | Liveness score < 0.85 en 1 intento | Bloqueo temporal del nodo (**60 s**). Notificación push inmediata al admin. Captura y almacenamiento del frame como evidencia en BD. |
| 🔴 **CRÍTICO** | `BRUTE_FORCE_DETECTED` | ≥ 5 intentos DENY consecutivos en < 120 s desde el mismo nodo | Bloqueo del nodo por **300 s**. Alerta de seguridad nivel 1. Log con historial completo de intentos y embeddings capturados. |
| 🟠 **ALTO** | `IDENTITY_MISMATCH` | Similitud < 0.82 con cualquier perfil registrado | DENY sin bloqueo. Almacenamiento del embedding del intento. Notificación diferida (resumen cada 15 min si hay más de 3 eventos). |
| 🟠 **ALTO** | `ACCESS_OUT_OF_SCHEDULE` | Identidad reconocida pero fuera de horario permitido | DENY + notificación inmediata al admin (puede indicar intento planificado). |
| 🟡 **MEDIO** | `LOW_QUALITY_FRAME` | Frame bajo umbral de calidad biométrica | Reintentos automáticos (máx. 3). Si persiste → DENY + log operativo. No genera alerta de seguridad. |
| 🟡 **MEDIO** | `USER_INACTIVE` | Usuario con estado BLOQUEADO o SUSPENDIDO en BD | DENY + notificación al admin del intento de un usuario bloqueado. |
| 🟢 **BAJO** | `RATE_LIMIT_EXCEEDED` | Cooldown no cumplido (< 3 s entre intentos) | DENY silencioso (solo log). Puede indicar doble presentación involuntaria. |
| ℹ️ **INFO** | `SUCCESSFUL_ACCESS` | Todos los umbrales superados | GRANT + log completo con timestamp, ID usuario, ID nodo y score de similitud. |

#### Canales de Notificación por Severidad

| Severidad | Canal Tiempo Real | Canal Consolidado |
|---|---|---|
| CRÍTICO / ALTO | Topic MQTT `sistema/alertas/{severidad}` + Push/Email inmediato | Dashboard actualizado en < 500 ms |
| MEDIO / BAJO / INFO | — | Reportes periódicos en consola de administración |

#### Flujo de Escalamiento de Alertas

```
Evento detectado
    → Clasificación de severidad    [Módulo Lógica de Negocio]  < 50 ms
    → Escritura en logs_acceso      [Módulo de Persistencia]     < 100 ms
    → Publicación MQTT              [Broker MQTT]                < 200 ms
    → Notificación push/email*      [Servicio de Notificaciones] < 2 s
    → Actualización de dashboard    [Interfaz Web — Capa 4]      < 500 ms
    → Resolución manual             [Administrador]              Manual

    * Solo para eventos CRÍTICO y ALTO
```

---

### 6.3.3.3 Modo OFFLINE_EMERGENCY — Lado Servidor

#### Mecanismos de Detección de Desconexión

| Mecanismo | Descripción | Umbral |
|---|---|---|
| **Heartbeat MQTT** | Cada nodo publica en `sistema/nodos/{id}/heartbeat` cada **30 s**. Si no se recibe en **90 s** (3 periodos) → nodo = `OFFLINE` | 90 s sin heartbeat |
| **Watchdog HTTP** | Si no hay confirmación del nodo tras un GRANT/DENY en **5 s** → se incrementa contador de timeouts. **3 timeouts** consecutivos → `OFFLINE` | 3 timeouts de 5 s c/u |

#### Máquina de Estados del Nodo

```
ONLINE ──────────── 1–2 timeouts ────────────► DEGRADADO
  ▲                                                │
  │                                    3+ timeouts │
  │                                                ▼
RECONECTADO ◄──────── heartbeat ────────────── OFFLINE
```

| Estado | Condición | Acción del Servidor |
|---|---|---|
| `ONLINE` | Heartbeat recibido en los últimos 90 s | Procesamiento normal de imágenes y publicación de comandos MQTT |
| `DEGRADADO` | 1–2 timeouts de heartbeat/HTTP | Prioridad aumentada en reintentos MQTT (QoS 2). Alerta `INFO` al admin. |
| `OFFLINE` | 3+ timeouts consecutivos o ausencia de heartbeat > 90 s | Activa `OFFLINE_EMERGENCY` en el nodo. Alerta `ALTO`. Inicia cola de sincronización FIFO. |
| `RECONECTADO` | Heartbeat recibido tras estado `OFFLINE` | Solicita sincronización de logs de MicroSD. Restaura modo normal. |

#### Protocolo de Contingencia Autónomo (sin intervención del administrador)

| Acción | Descripción Técnica | Objetivo |
|---|---|---|
| **Generación de lista blanca cifrada** | Snapshot JSON de usuarios con acceso activo en el nodo, firmado con **HMAC-SHA256** usando la clave compartida del nodo | Dotar al nodo de credenciales locales verificables sin conexión permanente |
| **Apertura de cola de sincronización** | Cola **FIFO** en el servidor para el nodo OFFLINE. Los eventos de la MicroSD se encolarán al reconectarse | Garantizar integridad del log de auditoría sin pérdida de registros |
| **Publicación de alerta OFFLINE** | Topic MQTT `sistema/alertas/ALTO` con JSON: `{node_id, timestamp_detección, estado: OFFLINE}` | Visibilidad inmediata del nodo fuera de servicio en el dashboard |
| **Reintentos periódicos de ping** | Ping al topic del nodo cada **15 s**. Si responde → inicia protocolo de reconexión | Detección automática del restablecimiento de conectividad |

#### Resincronización Post-Reconexión

| Paso | Acción | Detalle Técnico |
|---|---|---|
| **1** | Handshake de reconexión | Nodo publica en `sistema/nodos/{id}/reconnect` con: `timestamp_desconexión`, `timestamp_reconexión`, `cantidad_registros_pendientes` |
| **2** | Solicitud de logs pendientes | Servidor ejecuta `HTTP GET /api/v1/sync/logs?from={timestamp_offline}` |
| **3** | Validación e ingesta | Valida firma HMAC de cada registro → descarta duplicados por índice de secuencia → persiste en `logs_acceso` con flag `sync_mode = TRUE` |
| **4** | Confirmación y limpieza | Servidor confirma sincronización exitosa → nodo elimina registros ya sincronizados de la MicroSD |
| **5** | Restauración | Servidor actualiza estado del nodo a `ONLINE` en registro de dispositivos → retoma flujo normal |

> [!NOTE]
> El flag `sync_mode = TRUE` en los registros sincronizados permite distinguirlos de los procesados en tiempo real, facilitando **análisis forenses posteriores**.

---

## 6.3.4 Persistencia de Datos Relacionales

> [!IMPORTANT]
> Las subsecciones de este módulo están declaradas en el índice pero **no tienen contenido desarrollado en el PDF**. Lo siguiente es inferido del contexto del documento.

### 6.3.4.1 Selección del Motor de Base de Datos ⚠️

**Motor definido en el documento:** Oracle Database

| Aspecto | Valor |
|---|---|
| Motor | **Oracle Database** (mencionado explícitamente en la sección 6.2.10) |
| Acceso | Gestionado por el Middleware de la Capa 3 |
| Uso | Almacenar logs inmutables, imágenes de evidencia y registros de acceso |

### 6.3.4.2 Diseño del Esquema de Tablas ⚠️

> **A definir por el equipo.** Tablas inferidas del documento:

| Tabla | Campos inferidos |
|---|---|
| `logs_acceso` | `id`, `timestamp`, `node_id`, `user_id`, `event_type`, `severity`, `similarity_score`, `liveness_score`, `decision` (`GRANT`/`DENY`), `sync_mode` (BOOLEAN), `embedding_blob`, `evidence_image_blob` |
| `usuarios` | `id`, `nombre`, `embedding` (vector), `estado` (`ACTIVO`/`BLOQUEADO`/`SUSPENDIDO`), `horario_acceso_inicio`, `horario_acceso_fin` |
| `nodos` | `id`, `nombre`, `estado` (`ONLINE`/`OFFLINE`/`DEGRADADO`), `ultimo_heartbeat`, `timeout_count` |
| `sesiones` | `id`, `node_id`, `user_id`, `token`, `timestamp_grant`, `timestamp_cierre` |

### 6.3.4.3 Logs Inmutables e Integridad de Datos ⚠️

> **A definir por el equipo.** Requisitos inferidos:

| Requisito | Descripción |
|---|---|
| **Inmutabilidad** | Los registros de `logs_acceso` no deben ser modificables después de escritos |
| **Firma de integridad** | Cada log debería tener firma HMAC-SHA256 para verificar que no fue alterado |
| **Evidencia de spoofing** | Almacenar imagen del frame como BLOB en BD al detectar `SPOOFING_ATTEMPT` |
| **Flag de sincronización** | Campo `sync_mode = TRUE` para distinguir registros online vs. sincronizados offline |
| **Campos obligatorios** | Timestamp UTC, ID de nodo, ID de usuario, tipo de evento, score de similitud |

### 6.3.4.4 Política de Retención y Backup ⚠️

> **A definir por el equipo.**

---

## Resumen de Interfaces entre Módulos de la Capa 3

```
         ┌─────────────────────────────────┐
         │         CAPA 2 (Red)            │
         │  HTTP POST /api/v1/recognize    │
         └──────────────┬──────────────────┘
                        │ imagen JPEG + metadata nodo
                        ▼
         ┌─────────────────────────────────┐
         │   6.3.1 MOTOR DE IA             │
         │   • Liveness Detection          │
         │   • Detección facial            │
         │   • Extracción de embedding     │
         │   • Comparación coseno          │
         └──────────────┬──────────────────┘
                        │ {score, match_id, liveness_score}
                        ▼
         ┌─────────────────────────────────┐
         │   6.3.3 LÓGICA DE NEGOCIO       │
         │   • Cadena fail-fast 8 pasos    │
         │   • Validación de horario       │
         │   • Validación de estado        │
         │   • Rate limiting               │
         │   • Clasificación de alertas    │
         └────────┬─────────────┬──────────┘
                  │             │
          GRANT/DENY        log evento
                  │             │
                  ▼             ▼
         ┌────────────┐  ┌─────────────────┐
         │ MQTT Broker│  │ 6.3.4 BD Oracle │
         │ (Capa 2)   │  │  logs_acceso    │
         └────────────┘  │  usuarios       │
                         │  nodos          │
                         └─────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │  CAPA 4 (Dashboard) │
                    └─────────────────────┘
```

---

## Resumen Ejecutivo de Specs — Capa 3

| Módulo | Estado en PDF | Spec Clave |
|---|---|---|
| Motor de IA | ⚠️ Sin contenido | Pipeline: Liveness → Detección → Calidad → Embedding → Comparación |
| Framework de inferencia | ⚠️ Sin contenido | A elegir (TensorFlow / PyTorch / ONNX Runtime) |
| Liveness Detection | ⚠️ Sin contenido (umbral sí definido) | Umbral score: **≥ 0.85** |
| Reconocimiento facial | ⚠️ Sin contenido (umbral sí definido) | Similitud coseno: **≥ 0.82** |
| Lógica de negocio | ✅ Completo | Cadena fail-fast de **8 pasos secuenciales** |
| Gestión de alertas | ✅ Completo | 5 niveles: CRÍTICO / ALTO / MEDIO / BAJO / INFO |
| OFFLINE_EMERGENCY | ✅ Completo | Heartbeat 30 s / OFFLINE a los 90 s / lista blanca HMAC |
| Base de datos | ⚠️ Solo mencionado | **Oracle Database** / tabla `logs_acceso` con `sync_mode` |
