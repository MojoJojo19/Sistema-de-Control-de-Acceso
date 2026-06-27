import mqtt from 'mqtt';

// Usamos WebSocket para conectarnos al broker desde el navegador
const BROKER_URL = 'ws://localhost:9001'; 

class MQTTService {
  constructor() {
    this.client = null;
    this.callbacks = {};
  }

  connect() {
    console.log('Intentando conectar al Broker MQTT vía WebSockets...');
    this.client = mqtt.connect(BROKER_URL, {
      clientId: `dashboard_${Math.random().toString(16).slice(3)}`,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 1000,
    });

    this.client.on('connect', () => {
      console.log('✅ Conectado al Broker MQTT (Capa 2)');
      
      // Suscribirse a todos los tópicos relevantes según specs_capa4.md
      this.client.subscribe('sistema/alertas/#');
      this.client.subscribe('acceso/puerta/+/comando');
      this.client.subscribe('sistema/nodos/+/heartbeat');
      this.client.subscribe('sistema/nodos/+/reconnect');
    });

    this.client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        this._notifyCallbacks(topic, payload);
      } catch (error) {
        console.warn(`Mensaje MQTT no-JSON recibido en ${topic}:`, message.toString());
        this._notifyCallbacks(topic, message.toString());
      }
    });

    this.client.on('error', (err) => {
      console.error('Error MQTT:', err);
    });
  }

  subscribeToPattern(pattern, callback) {
    if (!this.callbacks[pattern]) {
      this.callbacks[pattern] = [];
    }
    this.callbacks[pattern].push(callback);
  }

  _notifyCallbacks(topic, payload) {
    // Si coincide con alertas
    if (topic.startsWith('sistema/alertas/')) {
      const severity = topic.split('/').pop();
      if (this.callbacks['alertas']) {
        this.callbacks['alertas'].forEach(cb => cb({ severity, ...payload }));
      }
    }
    // Si coincide con comandos de puerta
    else if (topic.startsWith('acceso/puerta/')) {
      if (this.callbacks['accesos']) {
        this.callbacks['accesos'].forEach(cb => cb(payload));
      }
    }
    // Si coincide con hearbeat
    else if (topic.includes('heartbeat')) {
      const nodeId = topic.split('/')[2];
      if (this.callbacks['heartbeats']) {
        this.callbacks['heartbeats'].forEach(cb => cb({ nodeId, ...payload }));
      }
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end();
    }
  }
}

export const mqttClient = new MQTTService();
