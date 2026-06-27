# 📡 Specs de Software — Capa 2: Capa de Red

> **Proyecto:** Sistema de Control de Acceso Inteligente con Visión Biométrica  
> **Universidad:** Universidad Nacional Mayor de San Marcos  
> **Capa analizada:** Capa 2 — Capa de Red (`sección 6.2` del documento)

---

## 🎯 Propósito de la Capa

Garantizar la **conectividad segura** entre los nodos biométricos (ESP32-S3) y el servidor central, empleando protocolos cifrados para la transmisión de datos biométricos, comandos de control y notificaciones en tiempo real.

---

## 1. Protocolos de Comunicación

### 1.1 HTTP REST (canal pesado / datos biométricos)

| Parámetro | Especificación |
|---|---|
| Método principal | `POST /api/v1/recognize` |
| Tipo de payload | Imagen JPEG comprimida (20–80 KB) + metadata del nodo |
| Modelo de comunicación | Request-Response **síncrono** |
| Cifrado | **TLS/HTTPS** obligatorio |
| Uso | Transmisión de imágenes faciales hacia el servidor |

### 1.2 MQTT (canal ligero / señales de control)

| Parámetro | Especificación |
|---|---|
| Uso | Comandos de actuación (`GRANT` / `DENY` / `ALERT`) |
| Modelo | Publicar/Suscribir (**asíncrono y reactivo**) |
| Cifrado | **TLS / MQTTS** obligatorio |
| QoS para comandos críticos | **QoS 1 o QoS 2** (entrega garantizada) |
| Topics del sistema | `acceso/puerta/{id}/comando` |
| Topics de alertas | `sistema/alertas/{severidad}` |
| Topics de heartbeat | `sistema/nodos/{id}/heartbeat` |
| Topics de reconexión | `sistema/nodos/{id}/reconnect` |

> **¿Por qué ambos protocolos?**  
> HTTP REST → canal confiable para datos voluminosos (imagen biométrica).  
> MQTT → canal ligero y reactivo para señales de control en tiempo real.

---

## 2. Flujo de Comunicación del Sistema

```
1. Detección    → Sensor ToF detecta presencia ≤ 1.5 m → activa ESP32-S3 desde Deep Sleep
2. Captura      → Cámara captura frame facial → ESP32 comprime JPEG (20–80 KB)
3. Transmisión  → POST /api/v1/recognize vía HTTPS al servidor (PC local)
4. Procesamiento→ PC ejecuta Liveness Detection + comparación de embeddings en BD
5. Decisión     → Servidor publica resultado en topic MQTT con payload GRANT o DENY
6. Actuación    → ESP32 recibe comando → activa Servo SG90 → log en MicroSD
7. Confirmación → ESP32 publica confirmación → PC actualiza BD y envía notificación
```

---

## 3. Casos de Uso de Comunicación

| Caso | Protocolo Activo | Resultado |
|---|---|---|
| Acceso autorizado | HTTP POST → MQTT GRANT | Puerta abre, log registrado |
| Intento sospechoso | HTTP POST → MQTT DENY + ALERT | Puerta bloqueada, alerta Push/Email |
| Nodo sin conectividad | Watchdog detecta timeout MQTT | Modo `OFFLINE_EMERGENCY`: RFID/teclado local |

---

## 4. Tipo de Red y Conectividad

| Tecnología | Rol |
|---|---|
| **Wi-Fi** | Principal: transmisión de datos biométricos en tiempo real |
| **Bluetooth** | Configuración inicial y emparejamiento de dispositivos |
| **Ethernet** | Opcional: para mayor estabilidad y velocidad |

---

## 5. Topología de Red

**Arquitectura Cliente-Servidor**

| Componente | Función |
|---|---|
| ESP32-CAM / ESP32-S3 | Cliente: captura y envía imágenes faciales |
| Router Wi-Fi | Permite comunicación entre dispositivos |
| Servidor central (PC local) | Procesa información biométrica y administra el sistema |
| Base de datos | Almacena registros de acceso e información de usuarios |
| Aplicación Web (Dashboard) | Monitoreo y administración remota |
| Broker MQTT | Intermediario de mensajes de control |

---

## 6. Seguridad en la Capa de Red

### 6.1 Cifrado de Extremo a Extremo
- **TLS/HTTPS**: para envío de imágenes pesadas vía HTTP REST.
- **TLS/MQTTS**: para comandos de actuación de la cerradura.

### 6.2 Autenticación de Nodos
- **JWT (JSON Web Tokens)** con **rotación dinámica**.
- Cada ESP32-CAM debe estar autenticado antes de publicar o suscribirse al Broker MQTT.

### 6.3 Mitigación de Amenazas
- **Segmentación de red** y **túnel cifrado**.
- Prevención de ataques **Man-in-the-Middle** y **Sniffing**.
- El vector biométrico es ilegible si se intercepta el tráfico Wi-Fi.

---

## 7. Calidad de Servicio (QoS) y Fiabilidad

| Requisito | Especificación |
|---|---|
| QoS para comandos críticos | QoS 1 o QoS 2 (entrega garantizada) |
| Retransmisión ante fallos | Reenvío automático de órdenes ante micro-cortes de red |
| Autenticación de nodos | JWT con rotación dinámica para cada ESP32-CAM |
| Control de acceso al broker | Solo dispositivos autenticados pueden comunicarse con el Broker MQTT |

---

## 8. Escalabilidad

| Característica | Descripción |
|---|---|
| Integración de nodos | Nuevos nodos IoT se integran sin afectar el funcionamiento |
| Detección automática | Los dispositivos se detectan automáticamente en la red |
| Configuración dinámica | Configuración de dispositivos vía red |
| Actualización remota | Capacidad de actualización OTA (Over-The-Air) |
| Expansión horizontal | Soporta múltiples accesos o sedes |

---

## 9. Middleware y Procesamiento Centralizado

| Módulo | Función |
|---|---|
| Orquestación y Lógica de Negocio | Centraliza la lógica de negocio como intermediario entre la red y los servicios finales |
| Inferencia Biométrica Centralizada | Aloja el motor de IA para reconocimiento facial y Liveness Detection / Anti-Spoofing |
| Persistencia Segura de Datos | Gestiona la conexión con base de datos Oracle para almacenar logs inmutables e imágenes de evidencia |

---

## 10. Métricas de Rendimiento y Validación

| Métrica | Objetivo / Umbral |
|---|---|
| Latencia de respuesta total | **< 500 ms** sostenidos bajo diferentes condiciones de carga Wi-Fi |
| Precisión biométrica | FAR (False Acceptance Rate) y FRR (False Rejection Rate) optimizados |
| Seguridad Anti-Spoofing | Validación mediante pruebas de ataques físicos simulados |
| Protección criptográfica | Verificación de TLS en todos los canales |
| Resiliencia operativa | Pruebas de fallos controlados; continuidad local garantizada |

---

## 11. Resiliencia Operativa — Modo `OFFLINE_EMERGENCY`

### 11.1 Detección de pérdida de conectividad (lado servidor)

| Mecanismo | Detalle |
|---|---|
| **Heartbeat MQTT** | Cada nodo publica cada **30 segundos** en `sistema/nodos/{id}/heartbeat`. Si no hay respuesta en **90 s** → nodo clasificado como OFFLINE |
| **Watchdog HTTP** | Si no hay confirmación del nodo en **5 segundos** tras un GRANT/DENY → se incrementa contador de timeouts. Tres timeouts consecutivos → estado OFFLINE |

### 11.2 Estados de nodo

| Estado | Condición de Activación | Acción del Servidor |
|---|---|---|
| `ONLINE` | Heartbeat recibido en los últimos 90 s | Procesamiento normal de imágenes y publicación de comandos MQTT |
| `DEGRADADO` | 1–2 timeouts de heartbeat o respuesta HTTP | Incremento de prioridad en reintentos MQTT (QoS 2). Alerta INFO al administrador |
| `OFFLINE` | 3+ timeouts consecutivos o ausencia de heartbeat > 90 s | Activación de `OFFLINE_EMERGENCY` en el nodo. Alerta ALTO. Inicio de cola de sincronización |
| `RECONECTADO` | Recepción de heartbeat tras estado OFFLINE | Solicitud de sincronización de logs en MicroSD. Restauración de modo normal |

### 11.3 Protocolo de contingencia del servidor

| Acción | Descripción | Objetivo |
|---|---|---|
| Generación de lista blanca cifrada | Snapshot JSON de usuarios con acceso activo, firmado con HMAC-SHA256 | Dotar al nodo de credenciales locales verificables sin conexión permanente |
| Apertura de cola de sincronización | Cola FIFO para eventos de acceso registrados en MicroSD del nodo | Garantizar integridad del log sin pérdida de registros |
| Publicación de alerta OFFLINE | Mensaje MQTT en `sistema/alertas/ALTO` con ID del nodo y timestamp | Visibilidad inmediata del administrador |
| Reintentos periódicos de ping | Ping al topic del nodo cada 15 segundos | Detección automática del restablecimiento de conectividad |

### 11.4 Resincronización Post-Reconexión

| Paso | Acción | Detalle Técnico |
|---|---|---|
| 1 | Handshake de reconexión | Nodo publica en `sistema/nodos/{id}/reconnect` con timestamps y cantidad de registros pendientes |
| 2 | Solicitud de logs pendientes | Servidor hace `HTTP GET /api/v1/sync/logs?from={timestamp_offline}` |
| 3 | Validación e ingesta | Valida firma HMAC, descarta duplicados por índice de secuencia, persiste en BD con flag `sync_mode = TRUE` |
| 4 | Confirmación y limpieza | Servidor confirma → nodo elimina registros ya sincronizados de MicroSD |
| 5 | Restauración de modo normal | Servidor actualiza estado del nodo a `ONLINE` |

---

## 12. Flujo de Escalamiento de Alertas

| Fase | Acción del Sistema | Responsable | Tiempo Máximo |
|---|---|---|---|
| Detección | Clasifica evento y asigna nivel de severidad | Módulo de Lógica de Negocio | < 50 ms |
| Registro | Escribe evento en `logs_acceso` con todos los metadatos | Módulo de Persistencia | < 100 ms |
| Publicación | Publica en topic MQTT según nivel de severidad | Broker MQTT | < 200 ms |
| Notificación | Envía alerta push/email para eventos CRÍTICO y ALTO | Servicio de Notificaciones | < 2 s |
| Visualización | Actualiza dashboard en tiempo real en la Capa de Aplicación | Interfaz Web (Capa 4) | < 500 ms |

---

## 13. Resumen de Especificaciones Técnicas Clave

| Aspecto | Especificación |
|---|---|
| **Protocolos** | HTTP REST + MQTT (híbrido) |
| **Cifrado** | TLS/HTTPS + TLS/MQTTS |
| **Autenticación** | JWT con rotación dinámica |
| **QoS** | QoS 1 o QoS 2 para comandos críticos |
| **Latencia objetivo** | < 500 ms end-to-end |
| **Detección de desconexión** | Heartbeat cada 30 s / timeout a los 90 s |
| **Payload de imagen** | JPEG comprimido 20–80 KB |
| **Endpoint principal** | `POST /api/v1/recognize` vía HTTPS |
| **Resincronización** | `GET /api/v1/sync/logs?from={timestamp}` |
| **Base de datos** | Oracle (gestionada por middleware) |
| **Modo contingencia** | `OFFLINE_EMERGENCY` con Store-and-Forward en MicroSD |

