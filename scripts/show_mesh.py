import sys
from pathlib import Path
import cv2

# Asegurar que se puede importar capa3
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from capa3.models.face_mesh import FaceMeshAnalyzer
from capa3.pipeline.preprocessor import load_image_file

def draw_mesh():
    image_path = BASE_DIR / "alice.png"
    if not image_path.exists():
        print(f"No se encontró {image_path}")
        return

    # Cargar imagen en RGB
    img_rgb = load_image_file(str(image_path))
    
    # Inicializar el analizador
    analyzer = FaceMeshAnalyzer()
    print("Analizando malla facial...")
    result = analyzer.analyze(img_rgb)
    
    if result.detected and result.landmarks is not None:
        print(f"Rostro detectado. Pose: Yaw={result.yaw_degrees:.1f}°, Pitch={result.pitch_degrees:.1f}°")
        # Cambiar a BGR para OpenCV
        img_bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
        
        # Dibujar cada landmark (478 puntos) con pequeños círculos verde neón
        for x, y, z in result.landmarks:
            cv2.circle(img_bgr, (int(x), int(y)), 1, (0, 255, 0), -1)
            
        # Dibujar puntos clave más grandes (ojos, nariz, boca) para resaltarlos
        from capa3.models.face_mesh import LEFT_EYE_LANDMARKS, RIGHT_EYE_LANDMARKS, NOSE_LANDMARKS, MOUTH_LANDMARKS
        for idx in LEFT_EYE_LANDMARKS + RIGHT_EYE_LANDMARKS:
            pt = result.landmarks[idx]
            cv2.circle(img_bgr, (int(pt[0]), int(pt[1])), 2, (0, 0, 255), -1) # Rojo para ojos
            
        for idx in NOSE_LANDMARKS:
            pt = result.landmarks[idx]
            cv2.circle(img_bgr, (int(pt[0]), int(pt[1])), 2, (255, 0, 0), -1) # Azul para nariz
            
        for idx in MOUTH_LANDMARKS:
            pt = result.landmarks[idx]
            cv2.circle(img_bgr, (int(pt[0]), int(pt[1])), 2, (0, 165, 255), -1) # Naranja para boca

        # Guardar en la carpeta de artefactos de esta conversación
        output_path = r"C:\Users\USER\.gemini\antigravity-ide\brain\c4f24085-bc7a-46b7-abab-730fcbf9c4b3\mesh_output.png"
        cv2.imwrite(output_path, img_bgr)
        print(f"Imagen guardada en: {output_path}")
    else:
        print("No se detectó la malla facial.")

if __name__ == "__main__":
    draw_mesh()
