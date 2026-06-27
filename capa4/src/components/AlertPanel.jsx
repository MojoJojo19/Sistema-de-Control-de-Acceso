import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { mqttClient } from '../services/mqttClient';

export const AlertPanel = () => {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    mqttClient.subscribeToPattern('alertas', (payload) => {
      // Solo mostrar CRITICO y ALTO como modales flotantes
      if (payload.severity === 'CRITICO' || payload.severity === 'ALTO') {
        const newAlert = {
          id: Date.now(),
          ...payload,
          time: new Date().toLocaleTimeString()
        };
        setAlerts(prev => [newAlert, ...prev]);
      }
    });
  }, []);

  const dismissAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      width: '380px'
    }}>
      {alerts.map(alert => (
        <div key={alert.id} className={`glass-panel slide-in ${alert.severity === 'CRITICO' ? 'alert-critical' : ''}`} style={{ 
          background: 'rgba(30, 41, 59, 0.95)',
          borderLeft: `4px solid ${alert.severity === 'CRITICO' ? 'var(--status-offline)' : 'var(--status-warning)'}`
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', color: alert.severity === 'CRITICO' ? 'var(--status-offline)' : 'var(--status-warning)' }}>
              <AlertTriangle size={24} />
              <strong style={{ fontSize: '1.2rem' }}>ALERTA {alert.severity}</strong>
            </div>
            <button onClick={() => dismissAlert(alert.id)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
          
          <div style={{ marginTop: '15px' }}>
            <p style={{ margin: '5px 0' }}><strong>Evento:</strong> {alert.event_type}</p>
            <p style={{ margin: '5px 0' }}><strong>Nodo:</strong> {alert.node_id}</p>
            <p style={{ margin: '5px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Hora: {alert.time}</p>
          </div>
          
          <button style={{
            marginTop: '15px',
            width: '100%',
            padding: '10px',
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            borderRadius: '6px',
            cursor: 'pointer'
          }} onClick={() => dismissAlert(alert.id)}>
            Marcar como revisado
          </button>
        </div>
      ))}
    </div>
  );
};
