"""
Capa 3 — Capa de Apoyo a Servicios
Sistema de Control de Acceso Inteligente con Visión Biométrica
Universidad Nacional Mayor de San Marcos

Módulos:
    - models:       Modelos de IA (FaceMesh, MTCNN, InceptionResnetV1, MiniFASNet, FAISS)
    - pipeline:     Motor de IA centralizado (pipeline de 9 pasos)
    - business:     Lógica de negocio (cadena fail-fast 8 pasos, alertas, rate limiting)
    - persistence:  Persistencia de datos relacionales (SQLAlchemy + Oracle/SQLite)
    - mqtt:         Publicación de decisiones y alertas vía MQTT
    - api:          API REST Flask (POST /api/v1/recognize)
"""

__version__ = "1.0.0"
