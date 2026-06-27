import paho.mqtt.client as mqtt
import json
import time
import uuid
import requests
import time
import uuid

BROKER = "127.0.0.1"
PORT = 1883

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Conectado al broker MQTT exitosamente!")
    else:
        print(f"Error al conectar, código: {rc}")

nodo_id = "ESP32-S3-LAB-01"

print(f"Obteniendo token JWT para el nodo {nodo_id}...")
try:
    # Obtenemos el JWT desde Capa 3 directamente
    res = requests.post("http://localhost:5000/api/v1/auth/token", json={"node_id": nodo_id})
    res.raise_for_status()
    token = res.json()["token"]
    print("Token obtenido con éxito.")
except Exception as e:
    print(f"Error obteniendo token: {e}")
    exit(1)

client = mqtt.Client()
client.username_pw_set(nodo_id, token)
client.on_connect = on_connect

print(f"Intentando conectar al broker securizado en {BROKER}:{PORT}...")
client.connect(BROKER, PORT, 60)
client.loop_start()

time.sleep(1) # Esperar a que conecte

# 1. Enviar un Heartbeat de un nodo nuevo
print(f"\n1. Enviando heartbeat del nodo {nodo_id}...")
heartbeat_payload = {
    "nodeId": nodo_id,
    "status": "ONLINE",
    "timestamp": time.time()
}
client.publish(f"sistema/nodos/{nodo_id}/heartbeat", json.dumps(heartbeat_payload))
time.sleep(2)

# 2. Enviar un evento de acceso exitoso
print("2. Enviando evento de acceso exitoso...")
acceso_payload = {
    "node_id": nodo_id,
    "user_id": 1005,
    "user": "Juan Pérez",
    "decision": "GRANT",
    "event_type": "SUCCESSFUL_ACCESS",
    "severity": "INFO",
    "similarity_score": 0.985,
    "liveness_score": 0.992,
    "pipeline_ms": 120,
    "sync_mode": 1
}
client.publish("sistema/accesos/registro", json.dumps(acceso_payload))
time.sleep(2)

# 3. Enviar una ALERTA CRÍTICA (Spoofing)
print("3. Enviando ALERTA CRÍTICA de Spoofing (debería aparecer notificación flotante)...")
alerta_payload = {
    "id": str(uuid.uuid4()),
    "node_id": nodo_id,
    "event_type": "SPOOFING_ATTEMPT",
    "severity": "CRITICO",
    "message": "Se detectó un intento de fraude facial (foto impresa)",
    "timestamp": time.time() * 1000,
    "has_evidence": True
}
client.publish(f"sistema/alertas/{nodo_id}", json.dumps(alerta_payload))

time.sleep(2)
client.loop_stop()
client.disconnect()
print("\nEventos enviados. Revisa el Dashboard de React!")
