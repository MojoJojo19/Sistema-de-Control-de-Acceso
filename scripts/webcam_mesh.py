import sys
import time
from pathlib import Path
import cv2

# Asegurar que se puede importar capa3
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from capa3.models.face_mesh import FaceMeshAnalyzer
from capa3.models.face_mesh import LEFT_EYE_LANDMARKS, RIGHT_EYE_LANDMARKS, NOSE_LANDMARKS, MOUTH_LANDMARKS

def run_webcam():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: No se pudo abrir la cámara web (índice 0).")
        return

    print("Inicializando Motor FaceMesh...")
    analyzer = FaceMeshAnalyzer()
    
    print("\n" + "="*50)
    print("🟢 Cámara activada. Malla Facial en Vivo.")
    print("👉 Presiona la letra 'q' en la ventana para salir.")
    print("="*50 + "\n")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Espejar la cámara para que se sienta como un espejo real
        frame = cv2.flip(frame, 1)

        # Convertir a RGB para el analizador
        img_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Analizar el frame (Medir latencia)
        start_t = time.time()
        result = analyzer.analyze(img_rgb)
        latency = (time.time() - start_t) * 1000
        
        if result.detected and result.landmarks is not None:
            # Dibujar la malla de 478 puntos
            for x, y, z in result.landmarks:
                cv2.circle(frame, (int(x), int(y)), 1, (0, 255, 0), -1)
                
            # Resaltar ojos (rojo)
            for idx in LEFT_EYE_LANDMARKS + RIGHT_EYE_LANDMARKS:
                pt = result.landmarks[idx]
                cv2.circle(frame, (int(pt[0]), int(pt[1])), 2, (0, 0, 255), -1)
                
            # Resaltar nariz (azul)
            for idx in NOSE_LANDMARKS:
                pt = result.landmarks[idx]
                cv2.circle(frame, (int(pt[0]), int(pt[1])), 2, (255, 0, 0), -1)
                
            # Resaltar boca (naranja)
            for idx in MOUTH_LANDMARKS:
                pt = result.landmarks[idx]
                cv2.circle(frame, (int(pt[0]), int(pt[1])), 2, (0, 165, 255), -1)

            # Mostrar texto con las métricas 3D en pantalla
            cv2.putText(frame, f"Yaw: {result.yaw_degrees:.1f}  Pitch: {result.pitch_degrees:.1f}", 
                        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            
            # Mostrar si pasa el validador estricto (máximo 30° de giro, simetría)
            valid_color = (0, 255, 0) if result.geometry_valid else (0, 0, 255)
            valid_text = "GEOMETRIA VALIDA" if result.geometry_valid else f"RECHAZADO: {result.rejection_reason}"
            cv2.putText(frame, valid_text, (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, valid_color, 2)

        # Mostrar latencia
        cv2.putText(frame, f"Latencia: {latency:.0f}ms", 
                    (10, frame.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

        # Mostrar ventana emergente
        cv2.imshow("Malla Facial 3D - En Vivo (Presiona 'q' para salir)", frame)

        # Capturar pulsación de tecla ('q' para salir)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    analyzer.close()

if __name__ == "__main__":
    run_webcam()
