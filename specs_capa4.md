# 🖥️ Specs de Software — Capa 4: Capa de Aplicación

> **Proyecto:** Sistema de Control de Acceso Inteligente con Visión Biométrica  
> **Universidad:** Universidad Nacional Mayor de San Marcos  
> **Capa analizada:** Capa 4 — Capa de Aplicación (`sección 6.4` del documento)

> [!WARNING]
> La sección 6.4 del PDF **solo contiene 2 líneas de descripción**:  
> *"Proporciona gestión integral de usuarios, monitoreo centralizado, auditoría de accesos, análisis de métricas y alertas inmediatas ante eventos sospechosos."*  
> Todo el detalle de estos specs fue construido compilando las **referencias a la Capa de Aplicación dispersas en las demás secciones del documento**.

---

## 🎯 Propósito de la Capa

Proveer la **interfaz administrativa web** que permite al operador de seguridad:
- Monitorear el estado de nodos y accesos **en tiempo real**
- Gestionar usuarios (alta, baja, suspensión, horarios)
- Auditar todos los eventos de acceso
- Recibir alertas inmediatas ante eventos críticos o sospechosos
- Desbloquear nodos y resolver incidentes manualmente
- Visualizar métricas de rendimiento y reportes consolidados

---

## 1. Módulos Funcionales

### Módulo 1 — Dashboard en Tiempo Real

**Origen en el documento:** secciones 6.2.6, 6.3.3.2, 6.3.3.3, objetivo específico §5.2

| Funcionalidad | Descripción |
|---|---|
| **Estado de nodos** | Indicador visual del estado de cada nodo: `ONLINE` / `DEGRADADO` / `OFFLINE` / `RECONECTADO` |
| **Feed de eventos** | Stream en vivo de todos los intentos de acceso con timestamp, ID usuario, ID nodo, decisión y score |
| **Alertas activas** | Panel de alertas no resueltas por nivel de severidad (CRÍTICO / ALTO / MEDIO) |
| **Actualización automática** | El dashboard se actualiza vía suscripción MQTT al topic `sistema/alertas/{severidad}` |
| **SLA de actualización** | Tiempo máximo de refresco: **< 500 ms** desde el evento |

### Módulo 2 — Gestión de Usuarios

**Origen en el documento:** secciones 6.3.3.1 (pasos 5, 6), 6.3.3.2 (`USER_INACTIVE`), 6.4

| Funcionalidad | Descripción |
|---|---|
| **Registro de usuario** | Alta de nuevo usuario con captura de embedding facial para la BD |
| **Estado del usuario** | Gestión de estados: `ACTIVO` / `BLOQUEADO` / `SUSPENDIDO` |
| **Horarios de acceso** | Asignación de rangos horarios permitidos por usuario (validados en paso 5 de la cadena) |
| **Bloqueo / Desbloqueo** | El administrador puede bloquear o desbloquear usuarios manualmente desde la consola |
| **Historial de accesos** | Vista de todos los eventos de un usuario específico con filtros por fecha y tipo |

### Módulo 3 — Auditoría de Accesos

**Origen en el documento:** secciones 6.3.3.1, 6.3.3.2, objetivo específico §5.2, sección 6.4

| Funcionalidad | Descripción |
|---|---|
| **Log completo de eventos** | Tabla con todos los registros de `logs_acceso`: timestamp, usuario, nodo, decisión, scores |
| **Filtros avanzados** | Filtrar por: tipo de evento, severidad, nodo, usuario, rango de fechas |
| **Eventos sincronizados** | Identificación visual de registros con flag `sync_mode = TRUE` (provenientes de reconexión offline) |
| **Evidencia de spoofing** | Visualización de imágenes almacenadas como evidencia ante `SPOOFING_ATTEMPT` |
| **Exportación** | Exportar registros de auditoría para análisis forense externo |
| **Trazabilidad en tiempo real** | Monitoreo continuo de accesos en tiempo real (objetivo §5.2 del documento) |

### Módulo 4 — Análisis de Métricas

**Origen en el documento:** sección 6.2.11, sección 6.4, objetivo específico §5.2

| Funcionalidad | Descripción |
|---|---|
| **Métricas biométricas** | Visualización de FAR y FRR por período |
| **Latencia del sistema** | Tiempo promedio de respuesta del pipeline (objetivo: < 500 ms) |
| **Tasa de accesos** | Accesos GRANT vs. DENY por nodo, por usuario y por franja horaria |
| **Intentos sospechosos** | Frecuencia de eventos `SPOOFING_ATTEMPT`, `BRUTE_FORCE_DETECTED` e `IDENTITY_MISMATCH` |
| **Disponibilidad de nodos** | Porcentaje de uptime de cada nodo (ratio ONLINE vs. OFFLINE) |
| **Reportes periódicos** | Reportes consolidados de eventos MEDIO e INFO accesibles desde la consola de administración |

### Módulo 5 — Gestión de Nodos

**Origen en el documento:** sección 6.3.3.3, secciones 6.2.7 (escalabilidad)

| Funcionalidad | Descripción |
|---|---|
| **Registro de nodos** | Alta de nuevos nodos ESP32-S3 (autoconfigurable en < 1 min según sección 6.1) |
| **Estado en tiempo real** | Indicador de estado `ONLINE` / `OFFLINE` / `DEGRADADO` con timestamp del último heartbeat |
| **Desbloqueo de nodo** | El administrador desbloquea manualmente un nodo bloqueado (por `SPOOFING_ATTEMPT` 60 s o `BRUTE_FORCE_DETECTED` 300 s) |
| **Historial de desconexiones** | Log de eventos OFFLINE con duración y cantidad de registros sincronizados |
| **Acuse de reconexión** | El admin marca el evento OFFLINE como "revisado" desde la consola |

### Módulo 6 — Sistema de Notificaciones

**Origen en el documento:** secciones 6.3.3.2, flujo de escalamiento de alertas

| Canal | Eventos que lo activan | SLA |
|---|---|---|
| **Actualización del dashboard** | Todos los eventos | < 500 ms |
| **Push / Email inmediato** | `SPOOFING_ATTEMPT`, `BRUTE_FORCE_DETECTED`, `ACCESS_OUT_OF_SCHEDULE`, `IDENTITY_MISMATCH` (> 3 en 15 min), `USER_INACTIVE` | < 2 s |
| **Resumen periódico** | `LOW_QUALITY_FRAME`, `RATE_LIMIT_EXCEEDED`, `SUCCESSFUL_ACCESS` | Consolidado periódico |

---

## 2. Interfaz de Usuario — Vistas Requeridas

| Vista | Descripción | Fuente |
|---|---|---|
| **Dashboard principal** | Estado de todos los nodos + feed de eventos recientes + alertas activas | §6.2.6, §6.3.3.2 |
| **Panel de alertas** | Lista priorizada de alertas CRÍTICO/ALTO no resueltas con botón "Marcar como revisado" | §6.3.3.2 |
| **Detalle de evento** | Vista completa de un evento: imagen de evidencia (si aplica), scores, metadatos, nodo, usuario | §6.3.3.2 |
| **Gestión de usuarios** | CRUD de usuarios + asignación de horarios + cambio de estado | §6.3.3.1 paso 5 y 6 |
| **Gestión de nodos** | Lista de nodos con estado en tiempo real + historial de desconexiones + desbloqueo | §6.3.3.3 |
| **Auditoría** | Log completo filtrable + exportación + flag `sync_mode` | §6.3.4.3 |
| **Métricas** | Gráficas de FAR/FRR, latencia, tasa de acceso, disponibilidad | §6.2.11, §6.4 |
| **Consola de administración** | Reportes periódicos de eventos MEDIO/INFO | §6.3.3.2 |

---

## 3. Integración con la Capa de Red (MQTT)

La Capa de Aplicación es **consumidora de MQTT**. Debe suscribirse a los siguientes topics:

| Topic MQTT | Evento | Acción en el Dashboard |
|---|---|---|
| `sistema/alertas/CRITICO` | `SPOOFING_ATTEMPT`, `BRUTE_FORCE_DETECTED` | Alerta visual inmediata + notificación push/email |
| `sistema/alertas/ALTO` | `IDENTITY_MISMATCH`, `ACCESS_OUT_OF_SCHEDULE`, nodo OFFLINE | Alerta visual + notificación push/email |
| `sistema/alertas/MEDIO` | `LOW_QUALITY_FRAME`, `USER_INACTIVE` | Registro en consola |
| `sistema/alertas/BAJO` | `RATE_LIMIT_EXCEEDED` | Solo log |
| `sistema/alertas/INFO` | `SUCCESSFUL_ACCESS` | Actualización del feed de eventos |
| `sistema/nodos/{id}/heartbeat` | Heartbeat de nodo activo | Actualización de estado del nodo |
| `sistema/nodos/{id}/reconnect` | Nodo reconectado | Inicio de flujo de resincronización + notificación al admin |
| `acceso/puerta/{id}/comando` | GRANT / DENY publicado | Actualización del feed de acceso en tiempo real |

---

## 4. SLAs y Requisitos de Rendimiento

| Acción | Tiempo Máximo | Fuente |
|---|---|---|
| Actualización del dashboard ante evento | **< 500 ms** | §6.3.3.2 — Flujo de Escalamiento |
| Envío de notificación push/email (CRÍTICO/ALTO) | **< 2 s** | §6.3.3.2 — Flujo de Escalamiento |
| Latencia total del sistema (end-to-end) | **< 500 ms** | §6.2.11 |
| Visualización de alerta en UI | Consumido del MQTT < 200 ms + render < 300 ms | Derivado de §6.3.3.2 |
| Registro de resolución manual por el admin | Sin SLA definido | Manual |

---

## 5. Requisitos No Funcionales

| Requisito | Descripción | Fuente |
|---|---|---|
| **Acceso remoto** | La aplicación web debe ser accesible de forma remota para administración | §6.2.6, §6.4 |
| **Monitoreo en tiempo real** | Estado y eventos deben actualizarse en tiempo real sin recarga manual | §5.2 (objetivo específico) |
| **Toma de decisiones basada en métricas** | La interfaz debe facilitar decisiones a partir de métricas de acceso | §5.2 (objetivo específico) |
| **Trazabilidad auditable** | Todos los eventos deben ser rastreables con metadatos completos | §5.1 (objetivo general) |
| **Escalabilidad** | La aplicación debe soportar múltiples nodos y accesos sin degradación | §6.2.7 |
| **Seguridad de acceso** | Solo administradores autenticados acceden a la consola | Implícito en la arquitectura |

---

## 6. Flujo de Interacción — Caso: Evento Crítico

```
Nodo ESP32-S3 detecta spoofing
    → Motor de IA: score Liveness < 0.85
    → Lógica de Negocio: clasifica CRÍTICO — SPOOFING_ATTEMPT     [< 50 ms]
    → Módulo de Persistencia: escribe en logs_acceso               [< 100 ms]
    → Broker MQTT: publica en sistema/alertas/CRITICO              [< 200 ms]
    → CAPA 4 suscrita al topic:
        ├── Dashboard: muestra alerta roja con imagen de evidencia  [< 500 ms]
        └── Servicio de notificaciones: envía push/email al admin   [< 2 s]
    → Nodo bloqueado automáticamente por 60 s (Capa 3)
    → Administrador recibe alerta, revisa evidencia en dashboard
    → Administrador marca el evento como "revisado"
    → Si aplica: desbloquea el nodo manualmente desde la consola
```

---

## 7. Flujo de Interacción — Caso: Nodo OFFLINE

```
Servidor detecta ausencia de heartbeat > 90 s
    → Capa 3: activa OFFLINE_EMERGENCY
    → Broker MQTT: publica en sistema/alertas/ALTO con estado OFFLINE [< 200 ms]
    → CAPA 4 suscrita al topic:
        ├── Dashboard: actualiza indicador del nodo a OFFLINE          [< 500 ms]
        └── Notificaciones: alerta push/email al admin                 [< 2 s]
    → Al reconectarse el nodo:
        ├── Dashboard: indicador cambia a RECONECTADO
        ├── Consola: muestra resumen de registros sincronizados
        └── Admin: puede marcar el evento como resuelto
```

---

## 8. Resumen Ejecutivo — Decisiones Pendientes del Equipo

> [!IMPORTANT]
> El PDF **no especifica tecnología, framework ni diseño** para la Capa 4. El equipo debe decidir:

| Decisión | Opciones sugeridas |
|---|---|
| **Framework frontend** | React / Vue.js / Angular / HTML+JS vanilla |
| **Librería de gráficas** | Chart.js / Recharts / D3.js |
| **Cliente MQTT en browser** | MQTT.js sobre WebSockets |
| **Autenticación de admin** | JWT (consistente con la Capa 2) / OAuth2 |
| **Servicio de notificaciones** | SMTP (email) + Firebase Cloud Messaging (push) |
| **Deploy** | Mismo servidor local (PC) o servidor dedicado |
| **Diseño UI** | A definir — el PDF no especifica wireframes ni mockups |

---

## 9. Resumen de Funcionalidades por Módulo

| Módulo | Funcionalidades Clave | Definido en PDF |
|---|---|---|
| Dashboard en Tiempo Real | Estado de nodos, feed de eventos, alertas activas, suscripción MQTT | ✅ Sí (referencias) |
| Gestión de Usuarios | CRUD, estados, horarios, bloqueo/desbloqueo | ✅ Sí (referencias) |
| Auditoría de Accesos | Log filtrable, evidencia de spoofing, `sync_mode`, exportación | ✅ Sí (referencias) |
| Análisis de Métricas | FAR/FRR, latencia, tasa de accesos, uptime de nodos | ✅ Sí (referencias) |
| Gestión de Nodos | Estado en tiempo real, desbloqueo, historial OFFLINE | ✅ Sí (referencias) |
| Sistema de Notificaciones | Push/email CRÍTICO/ALTO, reportes periódicos MEDIO/INFO | ✅ Sí (referencias) |
| Tecnología de implementación | Framework, librería, cliente MQTT, auth, deploy | ⚠️ No definido |
| Diseño visual / UI | Wireframes, paleta, componentes | ⚠️ No definido |
