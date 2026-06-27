import axios from 'axios';

// La Capa 3 corre en el puerto 5000 (Flask)
const API_URL = 'http://127.0.0.1:5000/api/v1';

export const fetchHealth = async () => {
  try {
    const response = await axios.get(`${API_URL}/health`);
    return response.data;
  } catch (error) {
    console.error('Error fetching health:', error);
    return null;
  }
};

export const fetchSyncLogs = async (fromTimestamp) => {
  try {
    const response = await axios.get(`${API_URL}/sync/logs?from=${fromTimestamp}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching logs:', error);
    return [];
  }
};

// Simulador de login para la UI
export const login = async (username, password) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ token: 'jwt_fake_token', user: { username, role: 'ADMIN' } });
    }, 500);
  });
};
