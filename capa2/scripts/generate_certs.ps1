# generate_certs.ps1
$ErrorActionPreference = "Stop"

$BASE_DIR = "C:\Users\USER\OneDrive\Desktop\Python\IoT"

$MOSQUITTO_CERTS = "$BASE_DIR\capa2\mosquitto\certs"
$NGINX_CERTS = "$BASE_DIR\capa2\nginx\certs"

Write-Host "Generando certificados autofirmados para Mosquitto (MQTT) y Nginx (API Gateway)..."

# 1. Generar CA (Certificate Authority)
openssl req -new -x509 -days 3650 -extensions v3_ca -keyout "$MOSQUITTO_CERTS\ca.key" -out "$MOSQUITTO_CERTS\ca.crt" -nodes -subj "/C=PE/ST=Lima/L=Lima/O=UNMSM/CN=SmartAccessCA"

# 2. Generar Certificado para Mosquitto
openssl genrsa -out "$MOSQUITTO_CERTS\mosquitto.key" 2048
openssl req -new -key "$MOSQUITTO_CERTS\mosquitto.key" -out "$MOSQUITTO_CERTS\mosquitto.csr" -subj "/C=PE/ST=Lima/L=Lima/O=UNMSM/CN=localhost"
openssl x509 -req -in "$MOSQUITTO_CERTS\mosquitto.csr" -CA "$MOSQUITTO_CERTS\ca.crt" -CAkey "$MOSQUITTO_CERTS\ca.key" -CAcreateserial -out "$MOSQUITTO_CERTS\mosquitto.crt" -days 3650

# 3. Generar Certificado para Nginx
openssl genrsa -out "$NGINX_CERTS\nginx.key" 2048
openssl req -new -key "$NGINX_CERTS\nginx.key" -out "$NGINX_CERTS\nginx.csr" -subj "/C=PE/ST=Lima/L=Lima/O=UNMSM/CN=localhost"
openssl x509 -req -in "$NGINX_CERTS\nginx.csr" -CA "$MOSQUITTO_CERTS\ca.crt" -CAkey "$MOSQUITTO_CERTS\ca.key" -CAcreateserial -out "$NGINX_CERTS\nginx.crt" -days 3650

Write-Host "Certificados generados correctamente."
