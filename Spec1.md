# [Especificación] Sistema de Verificación Facial para Control de Acceso (Hotel/Residencial)

## 1. Metadatos del Proyecto
*   **Nombre del Notebook:** `hotel_face_verification.ipynb`
*   **Librería de Rostros:** `facenet-pytorch` (provee MTCNN para detección rápida y FaceNet preentrenado para embeddings).
*   **Base de Datos Vectorial:** Simple (guardado en un archivo pickle/JSON) o base de datos ligera como FAISS / ChromaDB para producción.

## 2. Flujo del Notebook (.ipynb)

### Celda 1: Configuración de Dependencias
*   Instalación de `facenet-pytorch`, `opencv-python`, `scikit-learn` y `pillow`.

### Celda 2: Módulo de Registro (Enrollment)
*   Función `register_new_resident(image_path, resident_name)`:
    1. Lee la foto del residente.
    2. Usa **MTCNN** para detectar y recortar la cara exacta.
    3. Pasa la cara por **InceptionResnetV1** para obtener su embedding (vector de 512 números).
    4. Guarda el vector asociado al nombre en un diccionario local (Base de Datos simulada).

### Celda 3: Módulo de Verificación (Verification Pipeline)
*   Función `verify_access(frame, threshold=0.6)`:
    1. Recibe una imagen de la cámara de entrada.
    2. Detecta el rostro. Si no hay rostro, retorna "No se detecta rostro".
    3. Genera el embedding del rostro detectado.
    4. Calcula la distancia euclidiana entre este embedding y todos los embeddings registrados en la base de datos.
    5. Encuentra la distancia mínima. Si la distancia mínima es menor al `threshold`, retorna "Permitir Acceso a [Nombre]"; de lo contrario, "Acceso Denegado".

### Celda 4: Simulación y Pruebas Unitarias
*   Creación de una base de datos con 3-5 residentes de prueba.
*   Pruebas con imágenes de:
    *   Residentes registrados (deberían ingresar).
    *   Personas no registradas/intrusos (deberían ser rechazados).
    *   *Opcional:* Fotos del residente desde una pantalla de celular (para analizar vulnerabilidad a suplantación).

### Celda 5: Visualización de Resultados
*   Uso de `matplotlib` para mostrar el rostro detectado, la caja delimitadora en color verde (si es aceptado) o rojo (si es denegado), y el porcentaje de similitud. 