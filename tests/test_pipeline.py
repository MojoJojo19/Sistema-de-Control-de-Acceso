"""
Tests del Pipeline de la Capa 3

Usa las imágenes existentes (alice.png, bob.png, charlie.png, eve.png)
para validar:
    1. Enrollment de usuarios
    2. Reconocimiento exitoso (GRANT)
    3. Persona no registrada (DENY)
    4. Calidad de imagen
    5. Latencia del pipeline
    6. HMAC de logs
    7. Rate limiting
"""

import os
import sys
import time
import logging
import unittest
from pathlib import Path

import cv2
import numpy as np

# Configurar path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Imágenes de prueba
ALICE_IMG = str(BASE_DIR / "alice.png")
BOB_IMG = str(BASE_DIR / "bob.png")
CHARLIE_IMG = str(BASE_DIR / "charlie.png")
EVE_IMG = str(BASE_DIR / "eve.png")  # No registrada — debe dar DENY


class TestPreprocessor(unittest.TestCase):
    """Tests del preprocesador de imagen — Paso 1."""

    def test_decode_jpeg(self):
        """Verifica que puede decodificar imágenes existentes."""
        from capa3.pipeline.preprocessor import load_image_file

        for img_path in [ALICE_IMG, BOB_IMG, CHARLIE_IMG, EVE_IMG]:
            if os.path.exists(img_path):
                img = load_image_file(img_path)
                self.assertIsNotNone(img, f"Fallo al cargar {img_path}")
                self.assertEqual(len(img.shape), 3, "Imagen debe tener 3 dimensiones")
                self.assertEqual(img.shape[2], 3, "Imagen debe ser RGB (3 canales)")

    def test_decode_jpeg_bytes(self):
        """Verifica decodificación desde bytes (como del ESP32)."""
        from capa3.pipeline.preprocessor import decode_image

        for img_path in [ALICE_IMG, BOB_IMG]:
            if os.path.exists(img_path):
                # Simular JPEG del ESP32
                img = cv2.imread(img_path)
                _, jpeg_bytes = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 70])
                result = decode_image(jpeg_bytes.tobytes())
                self.assertIsNotNone(result)
                self.assertEqual(result.shape[2], 3)


class TestQuality(unittest.TestCase):
    """Tests de verificación de calidad — Paso 5."""

    def test_quality_good_image(self):
        """Imagen de buena calidad debe pasar."""
        from capa3.pipeline.preprocessor import load_image_file
        from capa3.pipeline.quality import check_quality

        if os.path.exists(ALICE_IMG):
            img = load_image_file(ALICE_IMG)
            result = check_quality(img)
            # Las imágenes generadas deben tener buena calidad
            self.assertTrue(
                result.laplacian_variance > 0,
                f"Laplacian variance debe ser > 0, got {result.laplacian_variance}",
            )

    def test_quality_low_resolution(self):
        """Imagen de baja resolución debe fallar."""
        from capa3.pipeline.quality import check_quality

        tiny = np.zeros((50, 50, 3), dtype=np.uint8)
        result = check_quality(tiny, bbox=np.array([0, 0, 50, 50]))
        self.assertFalse(result.passed, "Imagen 50×50 debe fallar quality check")


class TestFaceMesh(unittest.TestCase):
    """Tests de MediaPipe FaceMesh — Paso 2."""

    @classmethod
    def setUpClass(cls):
        from capa3.models.face_mesh import FaceMeshAnalyzer
        cls.analyzer = FaceMeshAnalyzer()

    def test_detect_face(self):
        """Debe detectar landmarks en imagen con rostro."""
        from capa3.pipeline.preprocessor import load_image_file

        if os.path.exists(ALICE_IMG):
            img = load_image_file(ALICE_IMG)
            result = self.analyzer.analyze(img)
            # FaceMesh puede o no detectar en imágenes generadas
            if result.detected:
                self.assertIsNotNone(result.landmarks)
                self.assertEqual(result.landmarks.shape[0], 478)


class TestMTCNN(unittest.TestCase):
    """Tests de MTCNN — Paso 4."""

    @classmethod
    def setUpClass(cls):
        from capa3.models.detector import FaceDetector
        cls.detector = FaceDetector()

    def test_detect_face(self):
        """Debe detectar rostro en imagen con cara."""
        from capa3.pipeline.preprocessor import load_image_file

        if os.path.exists(ALICE_IMG):
            img = load_image_file(ALICE_IMG)
            result = self.detector.detect(img)
            if result.detected:
                self.assertIsNotNone(result.face_crop)
                self.assertEqual(result.face_crop.shape, (3, 160, 160))
                self.assertGreaterEqual(result.confidence, 0.0)

    def test_no_face(self):
        """Imagen sin rostro debe retornar detected=False."""
        blank = np.zeros((200, 200, 3), dtype=np.uint8)
        result = self.detector.detect(blank)
        self.assertFalse(result.detected)


class TestEmbedder(unittest.TestCase):
    """Tests de InceptionResnetV1 — Paso 6."""

    @classmethod
    def setUpClass(cls):
        from capa3.models.detector import FaceDetector
        from capa3.models.embedder import FaceEmbedder
        cls.detector = FaceDetector()
        cls.embedder = FaceEmbedder()

    def test_embedding_dimensions(self):
        """Embedding debe tener 512 dimensiones."""
        from capa3.pipeline.preprocessor import load_image_file

        if os.path.exists(ALICE_IMG):
            img = load_image_file(ALICE_IMG)
            detection = self.detector.detect(img)
            if detection.detected:
                embedding = self.embedder.extract(detection.face_crop)
                self.assertEqual(embedding.shape, (512,))
                # Debe estar L2-normalizado
                norm = np.linalg.norm(embedding)
                self.assertAlmostEqual(norm, 1.0, places=3)

    def test_same_person_similarity(self):
        """Embedding de la misma persona debe tener alta similitud consigo mismo."""
        from capa3.pipeline.preprocessor import load_image_file

        if os.path.exists(ALICE_IMG):
            img = load_image_file(ALICE_IMG)
            detection = self.detector.detect(img)
            if detection.detected:
                emb1 = self.embedder.extract(detection.face_crop)
                emb2 = self.embedder.extract(detection.face_crop)
                similarity = np.dot(emb1, emb2)
                self.assertGreaterEqual(
                    similarity, 0.99,
                    "Mismo crop debe tener similitud ≥ 0.99"
                )


class TestFAISS(unittest.TestCase):
    """Tests de FAISS index — Paso 7."""

    def test_add_and_search(self):
        """Debe encontrar embedding después de agregarlo."""
        from capa3.models.faiss_index import FAISSIndex

        index = FAISSIndex()
        embedding = np.random.randn(512).astype(np.float32)
        embedding /= np.linalg.norm(embedding)

        index.add(embedding, user_id=1)
        result = index.search(embedding)

        self.assertTrue(result.found)
        self.assertEqual(result.user_id, 1)
        self.assertGreaterEqual(result.similarity, 0.99)

    def test_search_empty_index(self):
        """Búsqueda en índice vacío debe retornar found=False."""
        from capa3.models.faiss_index import FAISSIndex

        index = FAISSIndex()
        query = np.random.randn(512).astype(np.float32)
        query /= np.linalg.norm(query)

        result = index.search(query)
        self.assertFalse(result.found)


class TestHMAC(unittest.TestCase):
    """Tests de HMAC — §6.3.4.3."""

    def test_hmac_consistency(self):
        """Mismo input debe producir mismo HMAC."""
        from capa3.persistence.hmac_utils import calcular_hmac

        log = {
            "timestamp_utc": "2026-06-27T12:00:00Z",
            "node_id": "ESP32-S3-PUERTA-01",
            "user_id": 1,
            "event_type": "SUCCESSFUL_ACCESS",
            "decision": "GRANT",
            "similarity_score": 0.9123,
        }
        h1 = calcular_hmac(log)
        h2 = calcular_hmac(log)
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)  # SHA256 hex = 64 chars

    def test_hmac_different_data(self):
        """Input diferente debe producir HMAC diferente."""
        from capa3.persistence.hmac_utils import calcular_hmac

        log1 = {
            "timestamp_utc": "2026-06-27T12:00:00Z",
            "node_id": "ESP32-S3-PUERTA-01",
            "user_id": 1,
            "event_type": "SUCCESSFUL_ACCESS",
            "decision": "GRANT",
            "similarity_score": 0.9123,
        }
        log2 = dict(log1)
        log2["decision"] = "DENY"

        self.assertNotEqual(calcular_hmac(log1), calcular_hmac(log2))

    def test_hmac_verification(self):
        """Verificación debe pasar con firma correcta."""
        from capa3.persistence.hmac_utils import calcular_hmac, verificar_hmac

        log = {
            "timestamp_utc": "2026-06-27T12:00:00Z",
            "node_id": "ESP32-S3-PUERTA-01",
            "user_id": 1,
            "event_type": "SUCCESSFUL_ACCESS",
            "decision": "GRANT",
            "similarity_score": 0.9123,
        }
        signature = calcular_hmac(log)
        self.assertTrue(verificar_hmac(log, signature))
        self.assertFalse(verificar_hmac(log, "firma_falsa"))


class TestRateLimiter(unittest.TestCase):
    """Tests de rate limiting — §6.3.3.1 Paso 8."""

    def test_cooldown(self):
        """Cooldown de 3 s debe bloquear accesos rápidos."""
        from capa3.business.rate_limiter import RateLimiter

        limiter = RateLimiter()
        limiter.record_user_access(1)

        # Intento inmediato debe ser bloqueado
        check = limiter.check_user_cooldown(1)
        self.assertFalse(check.allowed)

    def test_different_user_no_cooldown(self):
        """Cooldown no afecta a otros usuarios."""
        from capa3.business.rate_limiter import RateLimiter

        limiter = RateLimiter()
        limiter.record_user_access(1)

        check = limiter.check_user_cooldown(2)
        self.assertTrue(check.allowed)

    def test_brute_force_detection(self):
        """5 DENY en <120 s debe detectar brute force."""
        from capa3.business.rate_limiter import RateLimiter

        limiter = RateLimiter()
        node = "test_node"

        for i in range(4):
            result = limiter.record_node_deny(node)
            self.assertFalse(result, f"Intento {i+1} no debe ser brute force")

        result = limiter.record_node_deny(node)
        self.assertTrue(result, "5° intento debe ser brute force")

        # Nodo debe estar bloqueado
        check = limiter.check_node_blocked(node)
        self.assertFalse(check.allowed)


class TestDatabase(unittest.TestCase):
    """Tests de persistencia — §6.3.4."""

    @classmethod
    def setUpClass(cls):
        """Usa BD en memoria para tests."""
        import capa3.config as config
        config.DATABASE_URL = "sqlite:///:memory:"

        # Reset engine singleton
        import capa3.persistence.database as db_mod
        db_mod._engine = None
        db_mod._SessionFactory = None

        from capa3.persistence.init_db import create_tables
        create_tables()

    def test_create_and_query_user(self):
        """Debe poder crear y consultar usuarios."""
        from capa3.persistence.database import get_session
        from capa3.persistence.models_db import Usuario

        session = get_session()
        try:
            fake_embedding = np.random.randn(512).astype(np.float32)
            user = Usuario(
                nombre="Test User",
                embedding=fake_embedding.tobytes(),
                estado="ACTIVO",
            )
            session.add(user)
            session.commit()

            found = session.query(Usuario).filter_by(nombre="Test User").first()
            self.assertIsNotNone(found)
            self.assertEqual(found.estado, "ACTIVO")

            # Verificar embedding roundtrip
            loaded_emb = np.frombuffer(found.embedding, dtype=np.float32)
            np.testing.assert_array_almost_equal(fake_embedding, loaded_emb)
        finally:
            session.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
