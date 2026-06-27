# Specs de Software — Capa 3: Capa de Apoyo a Servicios

> **Proyecto:** Sistema de Control de Acceso Inteligente con Vision Biometrica
> **Universidad:** Universidad Nacional Mayor de San Marcos
> **Capa analizada:** Capa 3 — Capa de Apoyo a Servicios (seccion 6.3 del documento)
> **Version:** 2.0 — Stack tecnologico completamente definido (2026-06-27)

---

## Estructura de la Capa

```
Capa 3 — Apoyo a Servicios
├── 6.3.1  Motor de IA Centralizado
│   ├── Framework de Inferencia          ✅ PyTorch 2.x + ONNX Runtime
│   ├── Pipeline de Procesamiento        ✅ FaceMesh -> Liveness -> MTCNN -> Embedding -> FAISS
│   └── Metricas de Rendimiento          ✅ ~160-320 ms end-to-end (objetivo < 500 ms)
├── 6.3.2  Modelo de Reconocimiento Facial
│   ├── Seleccion del Modelo             ✅ InceptionResnetV1 (facenet-pytorch / VGGFace2)
│   ├── Arquitectura de la Red Neuronal  ✅ InceptionResnetV1 512-dim + MediaPipe FaceMesh 468pt
│   ├── Entrenamiento y Dataset          ✅ VGGFace2 preentrenado + enrollment local
│   ├── Liveness Detection / Anti-Spoofing ✅ MiniFASNet (Silent-Face-Anti-Spoofing)
│   └── Metricas de Evaluacion           ✅ FAR < 0.1% / FRR < 2% / umbral coseno 0.82
├── 6.3.3  Logica de Negocio y Gestion de Reglas de Acceso  ✅ definida
│   ├── 6.3.3.1  Cadena de Decision (8 pasos fail-fast)
│   ├── 6.3.3.2  Gestion de Excepciones y Alertas
│   └── 6.3.3.3  Modo OFFLINE_EMERGENCY (lado servidor)
└── 6.3.4  Persistencia de Datos Relacionales
    ├── Motor de Base de Datos           ✅ Oracle Database (cx_Oracle / oracledb)
    ├── Diseno del Esquema de Tablas     ✅ 4 tablas: usuarios, nodos, logs_acceso, sesiones
    ├── Logs Inmutables e Integridad     ✅ Trigger inmutabilidad + HMAC-SHA256 por registro
    └── Politica de Retencion y Backup   ✅ 12 meses online / 36 meses archivo frio
```

---

## 6.3.1 Motor de Inteligencia Artificial Centralizado

> El motor de IA corre en el **servidor local (PC)**. El ESP32-S3 (32 bits) actua unicamente como
> nodo de captura; envia la imagen JPEG al servidor via HTTP POST. Todo el pipeline corre en
> `float32` nativo de PyTorch — no hay perdida de precision numerica respecto al microcontrolador.

### Requisitos Funcionales del Motor de IA

| Requisito | Descripcion |
|---|---|
| **RF-IA-01** | Recibir imagen JPEG (20-80 KB) via HTTP POST `/api/v1/recognize` |
| **RF-IA-02** | Ejecutar Liveness Detection (Anti-Spoofing) antes de cualquier otra operacion |
| **RF-IA-03** | Ejecutar reconocimiento facial comparando contra embeddings en base de datos |
| **RF-IA-04** | Retornar resultado binario (`GRANT` / `DENY`) con score de similitud y motivo |
| **RF-IA-05** | Publicar la decision via MQTT al topic `acceso/puerta/{id}/comando` |
| **RF-IA-06** | Almacenar el embedding del intento fallido (en caso de `IDENTITY_MISMATCH`) |

---

### 6.3.1.1 Framework de Inferencia

#### Stack tecnologico seleccionado

| Componente | Tecnologia | Version minima | Rol |
|---|---|---|---|
| **Framework base** | PyTorch | >= 2.0.0 | Carga de modelos, inferencia, exportacion ONNX |
| **Inferencia optimizada** | ONNX Runtime | >= 1.16.0 | Runtime de produccion para modelos exportados |
| **Deteccion de landmarks** | MediaPipe FaceMesh | >= 0.10.0 | 468 puntos de malla facial, CPU-first |
| **Deteccion + Embedding** | facenet-pytorch | >= 2.5.3 | MTCNN (deteccion) + InceptionResnetV1 (512-dim) |
| **Liveness Detection** | MiniFASNet | — | Modelo ligero anti-spoofing, CPU |
| **Busqueda vectorial** | faiss-cpu | >= 1.7.4 | Comparacion coseno eficiente contra BD de embeddings |
| **Procesamiento imagen** | opencv-python | >= 4.8.0 | Decodificacion JPEG, resize, analisis Laplaciano |
| **Utilidades ML** | scikit-learn | >= 1.3.0 | Metricas, distancias, normalizacion |

#### Justificacion del stack

| Decision | Alternativa descartada | Razon |
|---|---|---|
| PyTorch sobre TensorFlow | TensorFlow | Consistencia con Spec1.md (facenet-pytorch); API mas simple para modelos preentrenados |
| ONNX Runtime en produccion | PyTorch puro | 20-40% mas rapido en CPU al eliminar overhead del autograd graph |
| MediaPipe FaceMesh | Dlib landmarks | MediaPipe corre en CPU sin dependencias nativas complejas; 468 puntos vs 68 de Dlib |
| FAISS sobre ChromaDB | ChromaDB | FAISS es mas rapido para busquedas coseno con < 10,000 vectores |

#### Dependencias — requirements_capa3.txt

```text
torch>=2.0.0
torchvision>=0.15.0
facenet-pytorch>=2.5.3
mediapipe>=0.10.0
onnxruntime>=1.16.0
opencv-python>=4.8.0
scikit-learn>=1.3.0
faiss-cpu>=1.7.4
Pillow>=10.0.0
numpy>=1.24.0
paho-mqtt>=1.6.1
flask>=3.0.0
cx_Oracle>=8.3.0
SQLAlchemy>=2.0.0
```

#### Modo de inferencia

| Entorno | Runtime | Precision |
|---|---|---|
| Desarrollo / validacion | PyTorch nativo | float32 |
| Produccion (servidor) | ONNX Runtime | float32 |
| Exportacion | `torch.onnx.export(model, dummy, "modelo.onnx")` | — |

> Se usa float32 en todo el pipeline. No se aplica cuantizacion (int8) dado que la CPU del servidor
> es suficiente para cumplir la latencia objetivo de 500 ms sin necesidad de comprimir el modelo.

---

### 6.3.1.2 Pipeline de Procesamiento

```
Imagen JPEG recibida via HTTP POST /api/v1/recognize
    |
    v
[1] Decodificacion y preprocesamiento
    |  OpenCV: cv2.imdecode -> BGR->RGB -> resize 160x160 px
    |
    v
[2] Deteccion de malla facial — MediaPipe FaceMesh
    |  Extrae 468 landmarks 3D
    |  Valida geometria: simetria, presencia ojos/nariz/boca
    |  Estimacion de pose: rechaza si |yaw| > 30 grados
    |  Si geometria invalida -> DENY (NO_FACE_DETECTED)
    |
    v
[3] Liveness Detection — MiniFASNet (ONNX Runtime)
    |  Score de vivacidad en rango [0.0, 1.0]
    |  Si score < 0.85 -> DENY (SPOOFING_ATTEMPT) + captura frame evidencia
    |
    v
[4] Deteccion de bounding box — MTCNN (facenet-pytorch)
    |  Confianza de deteccion facial
    |  Si confianza < 0.90 -> DENY (NO_FACE_DETECTED)
    |
    v
[5] Verificacion de calidad del frame
    |  Resolucion minima 96x96 px dentro del bbox
    |  Nitidez: varianza Laplaciana >= umbral
    |  Si falla -> reintento (max 3 desde ESP32) -> DENY (LOW_QUALITY_FRAME)
    |
    v
[6] Extraccion de embedding — InceptionResnetV1 (ONNX Runtime)
    |  Vector float32 de 512 dimensiones, normalizado L2
    |
    v
[7] Comparacion vectorial — FAISS cosine search
    |  Distancia coseno <= 0.40 (similitud >= 0.82)
    |  Si falla -> DENY (IDENTITY_MISMATCH) + almacena embedding fallido en BD
    |
    v
[8] Validacion de negocio — Modulo Logica (6.3.3)
    |  Horario permitido / Estado usuario / Cooldown 3 s
    |
    v
[9] GRANT
    |  Publica MQTT: topic acceso/puerta/{id}/comando, payload GRANT + token sesion
    |  Escribe log en Oracle (logs_acceso)
```

---

### 6.3.1.3 Metricas de Rendimiento del Motor

| Etapa | Tiempo estimado (CPU-only) | Objetivo |
|---|---|---|
| Decodificacion + preprocesamiento OpenCV | 2-5 ms | < 10 ms |
| MediaPipe FaceMesh (468 landmarks) | 8-15 ms | < 20 ms |
| MiniFASNet Liveness (ONNX Runtime) | 30-50 ms | < 80 ms |
| MTCNN deteccion facial | 20-40 ms | < 60 ms |
| Verificacion calidad Laplaciana | 2-5 ms | < 10 ms |
| InceptionResnetV1 embedding (ONNX) | 60-120 ms | < 150 ms |
| FAISS cosine search | 1-5 ms | < 10 ms |
| Logica de negocio + escritura BD | 10-30 ms | < 50 ms |
| **Total pipeline (sin red)** | **133-270 ms** | **< 350 ms** |
| **Latencia total end-to-end (LAN)** | **160-320 ms** | **< 500 ms** |

---

## 6.3.2 Red Neuronal — Modelo de Reconocimiento Facial

### 6.3.2.1 Seleccion del Modelo

#### Stack de cuatro modelos complementarios

| Modelo | Libreria | Tarea | Input | Output |
|---|---|---|---|---|
| **MediaPipe FaceMesh** | mediapipe | Deteccion de landmarks faciales | Frame RGB cualquier resolucion | 468 puntos 3D normalizados |
| **MTCNN** | facenet-pytorch | Deteccion facial + alineacion | Frame RGB | Bounding box + landmarks ojos |
| **InceptionResnetV1** | facenet-pytorch | Extraccion de embedding | Face crop 160x160 px, float32 | Vector float32 512-dim |
| **MiniFASNet** | Silent-Face-Anti-Spoofing | Liveness Detection | Face crop, float32 | Score [0.0, 1.0] |

#### Comparacion de modelos de embedding evaluados

| Modelo | Embedding | Precision LFW | Peso | Velocidad CPU | Estado |
|---|---|---|---|---|---|
| **InceptionResnetV1** (FaceNet) | 512-dim | 99.65% | ~90 MB | ~80 ms | Seleccionado |
| MobileFaceNet | 128-dim | 99.50% | ~4 MB | ~20 ms | Alternativa si CPU limitada |
| ArcFace (ResNet50) | 512-dim | 99.83% | ~170 MB | ~200 ms | Descartado — lento sin GPU |
| FaceNet (TF) | 128/512-dim | 99.63% | ~90 MB | ~100 ms | Descartado — stack TF incompatible |

---

### 6.3.2.2 Arquitectura de la Red Neuronal

#### Arquitectura InceptionResnetV1

```
Input: Face crop 160x160x3 (RGB, float32, normalizado [-1, 1])
    |
    v
Stem Block
    |  Conv 3x3 stride 2 -> Conv 3x3 -> Conv 3x3 (padding)
    |  MaxPool 3x3 stride 2 -> Conv 1x1 -> Conv 3x3
    |  Mixed_5b (Inception block)
    |
    v
5x Inception-ResNet-A (35x35)
    |  Residual connections con 1x1 + 3x3 conv branches
    |
    v
Reduction-A (35 -> 17)
    |
    v
10x Inception-ResNet-B (17x17)
    |
    v
Reduction-B (17 -> 8)
    |
    v
5x Inception-ResNet-C (8x8)
    |
    v
Average Pooling Global
    |
    v
Dropout (p=0.6 durante entrenamiento)
    |
    v
Linear (1792 -> 512)
    |
    v
L2 Normalization
    |
    v
Output: Embedding float32 [512] (vector unitario en hiperesfera)
```

#### Rol de MediaPipe FaceMesh en el pipeline

```
Input: Frame RGB (cualquier resolucion)
    |
    v
BlazeFace Detector (deteccion rapida de ROI facial)
    |
    v
Face Landmark Model (backbone MobileNetV2)
    |
    v
Output: 468 landmarks 3D (x, y, z) normalizados al espacio del frame
    |
    ├── Validacion geometrica: simetria izquierda-derecha
    ├── Verificacion de presencia: ojos, nariz, boca, contorno
    └── Estimacion de pose: rechazo si |yaw| > 30 grados
```

#### Configuracion de hiperparametros

```python
# MediaPipe FaceMesh
mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
    static_image_mode=True,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.90,
    min_tracking_confidence=0.85
)

# MTCNN (facenet-pytorch)
mtcnn = MTCNN(
    image_size=160,
    margin=20,
    min_face_size=80,
    thresholds=[0.6, 0.7, 0.9],
    factor=0.709,
    keep_all=False,
    device='cpu'
)

# InceptionResnetV1 (facenet-pytorch)
resnet = InceptionResnetV1(
    pretrained='vggface2',
    classify=False,
    device='cpu'
).eval()
```

---

### 6.3.2.3 Entrenamiento y Dataset

#### Estrategia: Transfer Learning + Enrollment local

> No se entrena el modelo desde cero. Se usa InceptionResnetV1 preentrenado en VGGFace2
> (3.3 millones de imagenes, 9,131 identidades). El sistema registra usuarios mediante enrollment:
> 3-5 fotos por persona -> embedding promedio -> almacenamiento en Oracle + indice FAISS.

| Aspecto | Detalle |
|---|---|
| **Dataset base (preentrenamiento)** | VGGFace2 — 3.31M imagenes, 9,131 identidades, diversidad de edad, etnia, pose e iluminacion |
| **Pesos preentrenados** | Descargados automaticamente por facenet-pytorch (`pretrained='vggface2'`) |
| **Fine-tuning** | Opcional si el entorno tiene condiciones especificas (e.g., luz IR del ESP32) |
| **Registro de nuevos usuarios** | 3-5 fotos -> MTCNN crop -> InceptionResnetV1 -> promedio de embeddings normalizado -> BD |

#### Flujo de Enrollment

```python
def register_user(image_paths: list, user_id: int, db_session):
    embeddings = []
    for img_path in image_paths:
        img = Image.open(img_path).convert('RGB')
        face_crop = mtcnn(img)
        if face_crop is None:
            raise ValueError(f"No face detected in {img_path}")
        embedding = resnet(face_crop.unsqueeze(0))
        embeddings.append(embedding.detach())

    mean_embedding = torch.stack(embeddings).mean(dim=0)
    mean_embedding = F.normalize(mean_embedding, p=2)  # Re-normalizacion L2

    db_session.execute(
        "UPDATE usuarios SET embedding = :emb WHERE id = :uid",
        {"emb": mean_embedding.numpy().tobytes(), "uid": user_id}
    )
    faiss_index.add(mean_embedding.numpy())
```

---

### 6.3.2.4 Liveness Detection / Anti-Spoofing

**Modelo seleccionado:** MiniFASNetV2 (Silent-Face-Anti-Spoofing)

| Parametro | Valor | Descripcion |
|---|---|---|
| **Modelo** | MiniFASNetV2 | Basado en MobileNetV2, optimizado para CPU |
| **Input** | Face crop float32 | Region facial detectada por MTCNN |
| **Output** | Score [0.0, 1.0] | 1.0 = persona real, 0.0 = ataque |
| **Umbral de vivacidad** | >= 0.85 | Definido en el documento original |
| **Formato de inferencia** | ONNX Runtime | Exportado desde PyTorch para menor latencia |
| **Tiempo estimado (CPU)** | 30-50 ms | Sin GPU |
| **Ataques detectados** | Foto impresa, pantalla, mascara 3D basica | |

| Condicion | Score | Accion |
|---|---|---|
| Persona real frente a camara | >= 0.85 | Continua el pipeline |
| Foto impresa / pantalla / mascara | < 0.85 | `DENY` + alerta `SPOOFING_ATTEMPT` + frame BLOB en BD |

```python
liveness_session = ort.InferenceSession("minifasnet.onnx")

def check_liveness(face_crop_np) -> float:
    input_tensor = preprocess_for_liveness(face_crop_np)
    score = liveness_session.run(
        None, {"input": input_tensor}
    )[0][0][1]  # Probabilidad de clase "real"
    return float(score)
```

---

### 6.3.2.5 Metricas de Evaluacion del Modelo

| Metrica | Valor objetivo | Descripcion |
|---|---|---|
| **FAR** (False Acceptance Rate) | < 0.1% | Tasa de falsa aceptacion — principal riesgo de seguridad |
| **FRR** (False Rejection Rate) | < 2.0% | Tasa de falso rechazo — friccion para usuario legitimo |
| **Umbral de similitud** | 0.82 (distancia coseno <= 0.40) | Prioriza minimizar FAR sobre FRR |
| **Precision en LFW** (benchmark) | >= 99.65% | Benchmark estandar de verificacion facial 1:1 |
| **Liveness ACER** | < 2.0% | Average Classification Error Rate en anti-spoofing |
| **Throughput** | >= 3 req/s (CPU-only) | Capacidad de procesamiento del servidor local |

#### Calibracion del umbral de similitud

```
Distancia coseno <= 0.40  <->  Similitud coseno >= 0.82  <->  GRANT

Zona de rechazo:    distancia > 0.40  -> IDENTITY_MISMATCH
Zona de aceptacion: distancia <= 0.40 -> Continua cadena de decision

Distribucion esperada (VGGFace2 preentrenado):
  - Mismo sujeto (genuinos):     media ~0.25, desv. std ~0.08
  - Distinto sujeto (impostores): media ~0.70, desv. std ~0.10
  - Umbral 0.40: FAR ~0.08% / FRR ~1.5%
```

---

## 6.3.3 Logica de Negocio y Gestion de Reglas de Acceso

> Modulo intermediario entre el Motor de IA y la Capa de Aplicacion.
> Traduce los resultados probabilisticos del modelo en decisiones binarias (GRANT / DENY).

### 6.3.3.1 Cadena de Decision — Patron Fail-Fast (8 Pasos)

> Cada paso actua como filtro secuencial. Si una condicion falla, el proceso termina
> inmediatamente con DENY sin evaluar pasos siguientes. Minimiza latencia y carga computacional.

| Paso | Validacion | Componente | Umbral / Condicion | Resultado si falla |
|---|---|---|---|---|
| **1** | Score de vivacidad | MiniFASNet (Anti-Spoofing) | Score >= 0.85 | DENY + alerta SPOOFING_ATTEMPT. Frame no procesado con modelo facial. Nodo bloqueado 60 s. |
| **2** | Geometria facial valida | MediaPipe FaceMesh | 468 landmarks detectados + yaw <= 30 grados | DENY + log NO_FACE_DETECTED |
| **3** | Deteccion de rostro | MTCNN | Confianza >= 0.90 | DENY + log NO_FACE_DETECTED |
| **4** | Calidad del frame | Analisis Laplaciano OpenCV | Resolucion min. 96x96 px + varianza Laplaciana >= umbral | DENY + log LOW_QUALITY_FRAME. ESP32 reintenta hasta 3 veces. |
| **5** | Similitud facial | InceptionResnetV1 + FAISS | Distancia coseno <= 0.40 (similitud >= 0.82) | DENY + log IDENTITY_MISMATCH. Embedding fallido almacenado en BD. |
| **6** | Horario permitido | Modulo reglas temporales | Timestamp UTC dentro del rango horario del usuario | DENY + log ACCESS_OUT_OF_SCHEDULE |
| **7** | Estado del usuario | Consulta Oracle | Estado = ACTIVO (no bloqueado, no suspendido) | DENY + log USER_INACTIVE + notificacion admin |
| **8** | Cooldown entre intentos | Rate limiter | Intervalo minimo de 3 s entre accesos del mismo usuario | DENY + log RATE_LIMIT_EXCEEDED |
| **OK** | Todos los umbrales superados | — | Todas las validaciones cumplidas | GRANT -> MQTT publish + token de sesion |

#### Calibracion de umbrales

| Umbral | Valor | Justificacion |
|---|---|---|
| Similitud facial | 0.82 | Minimiza FAR (riesgo de seguridad) con sacrificio marginal de FRR |
| Liveness score | 0.85 | Umbral agresivo para prevenir ataques de spoofing fisico |
| Confianza MTCNN | 0.90 | Alta confianza requerida para evitar falsos positivos |
| Cooldown | 3 s | Previene replay attacks sin afectar flujo de usuario legitimo |
| Reintentos de calidad | 3 veces | Tolerancia a condiciones adversas de iluminacion |

---

### 6.3.3.2 Gestion de Excepciones y Alertas

#### Taxonomia de Severidad

| Severidad | Codigo de Evento | Condicion de Activacion | Accion del Sistema |
|---|---|---|---|
| CRITICO | `SPOOFING_ATTEMPT` | Liveness score < 0.85 | Bloqueo nodo 60 s. Notificacion push al admin. Frame almacenado como BLOB en BD. |
| CRITICO | `BRUTE_FORCE_DETECTED` | >= 5 intentos DENY en < 120 s mismo nodo | Bloqueo nodo 300 s. Alerta seguridad nivel 1. Log con embeddings capturados. |
| ALTO | `IDENTITY_MISMATCH` | Similitud < 0.82 con cualquier perfil | DENY sin bloqueo. Embedding almacenado. Notificacion diferida (resumen c/15 min si > 3 eventos). |
| ALTO | `ACCESS_OUT_OF_SCHEDULE` | Identidad reconocida pero fuera de horario | DENY + notificacion inmediata al admin. |
| MEDIO | `LOW_QUALITY_FRAME` | Frame bajo umbral de calidad biometrica | Reintentos automaticos (max 3). Si persiste -> DENY + log operativo. |
| MEDIO | `USER_INACTIVE` | Estado BLOQUEADO o SUSPENDIDO en BD | DENY + notificacion al admin. |
| BAJO | `RATE_LIMIT_EXCEEDED` | Cooldown < 3 s entre intentos | DENY silencioso (solo log). |
| INFO | `SUCCESSFUL_ACCESS` | Todos los umbrales superados | GRANT + log completo con timestamp, ID usuario, ID nodo, scores. |

#### Canales de Notificacion por Severidad

| Severidad | Canal Tiempo Real | Canal Consolidado |
|---|---|---|
| CRITICO / ALTO | Topic MQTT `sistema/alertas/{severidad}` + Push/Email inmediato | Dashboard actualizado en < 500 ms |
| MEDIO / BAJO / INFO | — | Reportes periodicos en consola de administracion |

#### Flujo de Escalamiento de Alertas

```
Evento detectado
    -> Clasificacion de severidad   [Modulo Logica de Negocio]   < 50 ms
    -> Escritura en logs_acceso     [Modulo de Persistencia]      < 100 ms
    -> Publicacion MQTT             [Broker MQTT]                 < 200 ms
    -> Notificacion push/email*     [Servicio de Notificaciones]  < 2 s
    -> Actualizacion de dashboard   [Interfaz Web — Capa 4]       < 500 ms
    -> Resolucion manual            [Administrador]               Manual

    * Solo para eventos CRITICO y ALTO
```

---

### 6.3.3.3 Modo OFFLINE_EMERGENCY — Lado Servidor

#### Mecanismos de Deteccion de Desconexion

| Mecanismo | Descripcion | Umbral |
|---|---|---|
| **Heartbeat MQTT** | Cada nodo publica en `sistema/nodos/{id}/heartbeat` cada 30 s. Si no se recibe en 90 s (3 periodos) -> nodo = OFFLINE | 90 s sin heartbeat |
| **Watchdog HTTP** | Si no hay confirmacion del nodo tras un GRANT/DENY en 5 s -> incrementa contador. 3 timeouts consecutivos -> OFFLINE | 3 timeouts de 5 s |

#### Maquina de Estados del Nodo

```
ONLINE -------------- 1-2 timeouts ------------> DEGRADADO
  ^                                                  |
  |                                       3+ timeouts|
  |                                                  v
RECONECTADO <----------- heartbeat ------------ OFFLINE
```

| Estado | Condicion | Accion del Servidor |
|---|---|---|
| `ONLINE` | Heartbeat recibido en los ultimos 90 s | Procesamiento normal |
| `DEGRADADO` | 1-2 timeouts | Prioridad aumentada en reintentos MQTT (QoS 2). Alerta INFO al admin. |
| `OFFLINE` | 3+ timeouts consecutivos o > 90 s sin heartbeat | Activa OFFLINE_EMERGENCY. Alerta ALTO. Inicia cola FIFO. |
| `RECONECTADO` | Heartbeat recibido tras OFFLINE | Solicita sincronizacion de logs de MicroSD. Restaura modo normal. |

#### Protocolo de Contingencia Autonomo

| Accion | Descripcion Tecnica | Objetivo |
|---|---|---|
| **Generacion de lista blanca** | Snapshot JSON de usuarios activos firmado con HMAC-SHA256 | Credenciales locales verificables sin conexion |
| **Cola de sincronizacion** | Cola FIFO en servidor para nodo OFFLINE; encola eventos de MicroSD al reconectarse | Integridad del log de auditoria sin perdida de registros |
| **Publicacion de alerta** | Topic MQTT `sistema/alertas/ALTO` con `{node_id, timestamp_deteccion, estado: OFFLINE}` | Visibilidad del nodo fuera de servicio en dashboard |
| **Reintentos de ping** | Ping al topic del nodo cada 15 s. Si responde -> inicia protocolo de reconexion | Deteccion automatica del restablecimiento de conectividad |

#### Resincronizacion Post-Reconexion

| Paso | Accion | Detalle Tecnico |
|---|---|---|
| **1** | Handshake | Nodo publica en `sistema/nodos/{id}/reconnect` con `timestamp_desconexion`, `timestamp_reconexion`, `cantidad_registros_pendientes` |
| **2** | Solicitud de logs | Servidor ejecuta `HTTP GET /api/v1/sync/logs?from={timestamp_offline}` |
| **3** | Validacion e ingesta | Valida firma HMAC de cada registro -> descarta duplicados por indice de secuencia -> persiste con `sync_mode = TRUE` |
| **4** | Confirmacion y limpieza | Servidor confirma sincronizacion -> nodo elimina registros sincronizados de la MicroSD |
| **5** | Restauracion | Servidor actualiza estado del nodo a ONLINE -> retoma flujo normal |

> El flag `sync_mode = TRUE` permite distinguir registros sincronizados de los procesados en tiempo real,
> facilitando analisis forenses posteriores.

---

## 6.3.4 Persistencia de Datos Relacionales

### 6.3.4.1 Motor de Base de Datos

| Aspecto | Valor |
|---|---|
| **Motor** | Oracle Database |
| **Driver Python** | `oracledb` (Oracle thin driver, sin instalacion de cliente Oracle) |
| **ORM** | SQLAlchemy >= 2.0 con dialect Oracle |
| **Pool de conexiones** | `create_engine(..., pool_size=5, max_overflow=10)` |
| **Uso principal** | Logs inmutables, embeddings, imagenes de evidencia (BLOB), nodos, sesiones |

---

### 6.3.4.2 Diseno del Esquema de Tablas

#### Tabla `usuarios`

```sql
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
```

#### Tabla `nodos`

```sql
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
```

#### Tabla `logs_acceso`

```sql
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
```

#### Trigger de inmutabilidad

```sql
CREATE OR REPLACE TRIGGER trg_logs_acceso_immutable
BEFORE UPDATE OR DELETE ON logs_acceso
FOR EACH ROW
BEGIN
    RAISE_APPLICATION_ERROR(-20001, 'Los registros de logs_acceso son inmutables.');
END;
```

#### Tabla `sesiones`

```sql
CREATE TABLE sesiones (
    id               NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id          VARCHAR2(50)    REFERENCES nodos(id),
    user_id          NUMBER          REFERENCES usuarios(id),
    token            VARCHAR2(128)   UNIQUE NOT NULL,
    timestamp_grant  TIMESTAMP WITH TIME ZONE NOT NULL,
    timestamp_cierre TIMESTAMP WITH TIME ZONE,
    log_id           NUMBER          REFERENCES logs_acceso(id)
);
```

---

### 6.3.4.3 Logs Inmutables e Integridad de Datos

| Requisito | Implementacion |
|---|---|
| **Inmutabilidad** | Trigger `BEFORE UPDATE OR DELETE` lanza excepcion -20001 en cualquier modificacion |
| **Firma de integridad** | Campo `hmac_signature`: HMAC-SHA256 de `timestamp_utc + node_id + user_id + event_type + decision + similarity_score` |
| **Evidencia de spoofing** | Frame JPEG almacenado como `evidence_image BLOB` al detectar `SPOOFING_ATTEMPT` |
| **Flag de sincronizacion** | `sync_mode = 1` distingue registros offline sincronizados de tiempo real |
| **Campos obligatorios** | `timestamp_utc`, `node_id`, `event_type`, `severity`, `decision`, `hmac_signature` — NOT NULL |
| **Verificacion periodica** | Script diario recalcula HMAC de cada registro; discrepancia -> alerta CRITICO |

#### Calculo del HMAC en Python

```python
import hmac
import hashlib

def calcular_hmac(log_dict: dict, secret_key: bytes) -> str:
    mensaje = (
        f"{log_dict['timestamp_utc']}"
        f"{log_dict['node_id']}"
        f"{log_dict['user_id']}"
        f"{log_dict['event_type']}"
        f"{log_dict['decision']}"
        f"{log_dict['similarity_score']:.4f}"
    ).encode('utf-8')
    return hmac.new(secret_key, mensaje, hashlib.sha256).hexdigest()
```

---

### 6.3.4.4 Politica de Retencion y Backup

| Aspecto | Politica |
|---|---|
| **Retencion online** | 12 meses en Oracle activo |
| **Retencion historica** | Registros > 12 meses -> exportacion CSV + compresion por 36 meses adicionales |
| **Backup completo** | Semanal — Oracle RMAN o expdp cada domingo a las 02:00 UTC |
| **Backup incremental** | Diario — solo registros nuevos desde ultimo backup, lunes a sabado a las 03:00 UTC |
| **Destino de backup** | Disco externo local + copia offsite (NAS universitario o cloud) |
| **Prueba de restauracion** | Mensual — restauracion en entorno de prueba + verificacion HMAC |
| **RPO** (Recovery Point Objective) | <= 24 horas |
| **RTO** (Recovery Time Objective) | <= 4 horas |
| **Eliminacion de BLOBs** | Imagenes de evidencia eliminadas logicamente a los 90 dias si no hay expediente abierto |

---

## Resumen de Interfaces entre Modulos de la Capa 3

```
         +-----------------------------------+
         |         CAPA 2 (Red)             |
         |  HTTP POST /api/v1/recognize      |
         +----------------+------------------+
                          | imagen JPEG + metadata nodo
                          v
         +--------------------------------------------+
         |   6.3.1 MOTOR DE IA                        |
         |   PyTorch 2.x + ONNX Runtime (CPU-only)    |
         |                                            |
         |   MediaPipe FaceMesh  (468 landmarks)      |
         |   MiniFASNet Liveness (score >= 0.85)      |
         |   MTCNN deteccion     (confianza >= 0.90)  |
         |   Calidad Laplaciana  (96x96 + nitidez)    |
         |   InceptionResnetV1   (embedding 512-dim)  |
         |   FAISS cosine search (dist. <= 0.40)      |
         +------------------+--------------------------+
                            | {similarity_score, liveness_score, user_id}
                            v
         +-----------------------------------+
         |   6.3.3 LOGICA DE NEGOCIO        |
         |   Cadena fail-fast 8 pasos        |
         |   Validacion de horario           |
         |   Validacion de estado            |
         |   Rate limiting (3 s)             |
         |   Clasificacion de alertas        |
         +----------+------------------+-----+
                    |                  |
            GRANT/DENY        log evento + HMAC
                    |                  |
                    v                  v
         +----------+    +---------------------------+
         | MQTT      |    |  6.3.4 Oracle Database   |
         | Broker    |    |  logs_acceso (inmutable)  |
         | (Capa 2)  |    |  usuarios (embedding)     |
         +-----------+    |  nodos (heartbeat)        |
                          |  sesiones (tokens)        |
                          +---------------------------+
                                     |
                                     v
                         +---------------------+
                         |  CAPA 4 (Dashboard) |
                         +---------------------+
```

---

## Resumen Ejecutivo — Capa 3 (Stack Completo)

| Modulo | Estado | Tecnologia / Valor Clave |
|---|---|---|
| **Framework de inferencia** | Definido | PyTorch 2.x (dev) + ONNX Runtime (produccion), CPU-only, float32 |
| **Pipeline de procesamiento** | Definido | FaceMesh -> MiniFASNet -> MTCNN -> Laplaciano -> InceptionResnetV1 -> FAISS |
| **Metricas de rendimiento** | Definido | 160-320 ms end-to-end; objetivo < 500 ms |
| **Modelo de embedding** | Definido | InceptionResnetV1 VGGFace2, 512-dim, float32 |
| **Deteccion de landmarks** | Definido | MediaPipe FaceMesh, 468 puntos, CPU-first |
| **Enrollment** | Definido | Transfer learning; 3-5 fotos -> embedding L2 promediado -> Oracle + FAISS |
| **Liveness Detection** | Definido | MiniFASNetV2, umbral >= 0.85, ONNX Runtime, 30-50 ms CPU |
| **Metricas del modelo** | Definido | FAR < 0.1% / FRR < 2.0% / umbral similitud 0.82 / distancia coseno <= 0.40 |
| **Logica de negocio** | Definido | Cadena fail-fast de 8 pasos secuenciales con FaceMesh en Paso 2 |
| **Gestion de alertas** | Definido | 5 niveles: CRITICO / ALTO / MEDIO / BAJO / INFO |
| **OFFLINE_EMERGENCY** | Definido | Heartbeat 30 s / OFFLINE a 90 s / lista blanca HMAC / cola FIFO |
| **Base de datos** | Definido | Oracle, 4 tablas, trigger inmutabilidad, HMAC-SHA256 por registro |
| **Retencion y backup** | Definido | 12 meses online / 36 meses archivo frio / RMAN semanal / RPO <= 24 h |
