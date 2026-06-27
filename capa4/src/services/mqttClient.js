import mqtt from 'mqtt';
import { getMqttToken } from './api';

// Usamos WebSocket para conectarnos al broker desde el navegador
const BROKER_URL = 'ws://localhost:9001'; 

/**
 * MQTTService — Cliente MQTT para la Capa de Aplicación
 * 
 * Suscribe a todos los topics definidos en specs_capa4.md §3:
 *   - sistema/alertas/{severidad}  → Alertas por nivel
 *   - sistema/nodos/{id}/heartbeat → Heartbeats de nodos
 *   - sistema/nodos/{id}/reconnect → Reconexión de nodos
 *   - acceso/puerta/{id}/comando   → Decisiones GRANT/DENY
 */
class MQTTService {
  constructor() {
    this.client = null;
    this.callbacks = {};
    this._stateCallbacks = [];
    this._connected = false;
    this._reconnectAttempts = 0;
  }

  get connected() {
    return this._connected;
  }

  async connect() {
    console.log('Obteniendo JWT para MQTT...');
    // Simulamos un Node ID fijo para el dashboard (en prod sería dinámico por usuario)
    const clientId = `dashboard_${Math.random().toString(16).slice(3)}`;
    const tokenData = await getMqttToken('dashboard_admin');
    
    let options = {
      clientId: clientId,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 3000,
    };

    if (tokenData && tokenData.token) {
      options.username = 'dashboard_admin';
      options.password = tokenData.token;
    } else {
      console.warn('⚠️ No se pudo obtener token MQTT, intentando sin credenciales...');
    }

    console.log('Intentando conectar al Broker MQTT vía WebSockets...');
    this.client = mqtt.connect(BROKER_URL, options);

    this.client.on('connect', () => {
      console.log('✅ Conectado al Broker MQTT (Capa 2)');
      this._connected = true;
      this._reconnectAttempts = 0;
      this._notifyState('connected');
      
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
        this._notifyCallbacks(topic, { raw: message.toString() });
      }
    });

    this.client.on('error', (err) => {
      console.error('Error MQTT:', err);
      this._notifyState('error', err);
    });

    this.client.on('close', () => {
      this._connected = false;
      this._reconnectAttempts++;
      this._notifyState('disconnected');
    });

    this.client.on('reconnect', () => {
      this._notifyState('reconnecting');
    });
  }

  subscribeToPattern(pattern, callback) {
    if (!this.callbacks[pattern]) {
      this.callbacks[pattern] = [];
    }
    this.callbacks[pattern].push(callback);
    // Retornar función de unsubscribe
    return () => {
      this.callbacks[pattern] = this.callbacks[pattern].filter(cb => cb !== callback);
    };
  }

  onStateChange(callback) {
    this._stateCallbacks.push(callback);
    // Enviar estado actual inmediatamente
    callback(this._connected ? 'connected' : 'disconnected');
    return () => {
      this._stateCallbacks = this._stateCallbacks.filter(cb => cb !== callback);
    };
  }

  _notifyState(state, data) {
    this._stateCallbacks.forEach(cb => cb(state, data));
  }

  _notifyCallbacks(topic, payload) {
    // Si coincide con alertas — sistema/alertas/{severidad}
    if (topic.startsWith('sistema/alertas/')) {
      const severity = topic.split('/').pop();
      if (this.callbacks['alertas']) {
        this.callbacks['alertas'].forEach(cb => cb({ severity, ...payload }));
      }
      // Notificar por severidad específica
      const severityKey = `alertas_${severity}`;
      if (this.callbacks[severityKey]) {
        this.callbacks[severityKey].forEach(cb => cb(payload));
      }
    }
    // Si coincide con comandos de puerta — acceso/puerta/{id}/comando
    else if (topic.startsWith('acceso/puerta/')) {
      const doorId = topic.split('/')[2];
      if (this.callbacks['accesos']) {
        this.callbacks['accesos'].forEach(cb => cb({ doorId, ...payload }));
      }
    }
    // Si coincide con heartbeat — sistema/nodos/{id}/heartbeat
    else if (topic.includes('heartbeat')) {
      const nodeId = topic.split('/')[2];
      if (this.callbacks['heartbeats']) {
        this.callbacks['heartbeats'].forEach(cb => cb({ nodeId, ...payload }));
      }
    }
    // Si coincide con reconnect — sistema/nodos/{id}/reconnect
    else if (topic.includes('reconnect')) {
      const nodeId = topic.split('/')[2];
      if (this.callbacks['reconnect']) {
        this.callbacks['reconnect'].forEach(cb => cb({ nodeId, ...payload }));
      }
    }

    // Callback genérico para todos los mensajes
    if (this.callbacks['*']) {
      this.callbacks['*'].forEach(cb => cb({ topic, ...payload }));
    }
  }

  publish(topic, payload) {
    if (this.client && this._connected) {
      this.client.publish(topic, JSON.stringify(payload));
    }
  }

  disconnect() {
    if (this.client) {
      this.client.end();
      this._connected = false;
    }
  }
}

export const mqttClient = new MQTTService();
