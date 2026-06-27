import axios from 'axios';

/**
 * API Service — Integración con Capa 3 (Flask)
 * 
 * Endpoints disponibles en Capa 3:
 *   POST /api/v1/recognize  → Reconocimiento facial
 *   POST /api/v1/enroll     → Enrollment de usuario
 *   GET  /api/v1/sync/logs  → Resincronización
 *   GET  /api/v1/health     → Estado del servidor
 */

// API_URL ahora apunta al API Gateway (Nginx - Capa 2) en el puerto 80 (o 443 para HTTPS)
const API_URL = 'http://localhost/api/v1';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Interceptor para agregar token JWT si existe
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('capa4_auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ========== Health ==========
export const fetchHealth = async () => {
  try {
    const response = await api.get('/health');
    return response.data;
  } catch (error) {
    console.error('Error fetching health:', error);
    return null;
  }
};

// ========== Sync Logs ==========
export const fetchSyncLogs = async (fromTimestamp, nodeId) => {
  try {
    const response = await api.get('/sync/logs', {
      params: { from: fromTimestamp, node_id: nodeId },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching sync logs:', error);
    return { events: [], pending_count: 0 };
  }
};

// ========== Enrollment ==========
export const enrollUser = async (nombre, email, imageFiles) => {
  try {
    const formData = new FormData();
    formData.append('nombre', nombre);
    if (email) formData.append('email', email);
    imageFiles.forEach(file => formData.append('images', file));

    const response = await api.post('/enroll', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    console.error('Error en enrollment:', error);
    throw error.response?.data || { error: 'Error de conexión con el servidor' };
  }
};

// ========== Recognize ==========
export const recognize = async (imageFile, nodeId) => {
  try {
    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('node_id', nodeId);

    const response = await api.post('/recognize', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  } catch (error) {
    console.error('Error en reconocimiento:', error);
    throw error.response?.data || { error: 'Error de conexión' };
  }
};

// ========== Auth (MQTT) ==========
export const getMqttToken = async (nodeId) => {
  try {
    const response = await api.post('/auth/token', { node_id: nodeId });
    return response.data; // { token, node_id, expires_in_hours }
  } catch (error) {
    console.error('Error fetching MQTT token:', error);
    return null;
  }
};

// ========== Auth (simulado) ==========
export const login = async (username, password) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (username === 'admin' && password === 'admin') {
        const token = 'jwt_' + Math.random().toString(36).slice(2);
        localStorage.setItem('capa4_auth_token', token);
        resolve({ success: true, token, user: { username, role: 'ADMIN' } });
      } else {
        resolve({ success: false, error: 'Credenciales inválidas' });
      }
    }, 500);
  });
};

export const logout = () => {
  localStorage.removeItem('capa4_auth_token');
};

export const isAuthenticated = () => {
  return !!localStorage.getItem('capa4_auth_token');
};

export default api;
