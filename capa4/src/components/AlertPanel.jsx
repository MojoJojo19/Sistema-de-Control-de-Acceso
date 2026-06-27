import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X, Bell, CheckCircle, Volume2, VolumeX, Eye } from 'lucide-react';
import { mqttClient } from '../services/mqttClient';
import { dataStore } from '../services/dataStore';
import { notificationService } from '../services/notificationService';
import { StatusBadge } from './shared/StatusBadge';
import { EventDetailModal } from './shared/EventDetailModal';

/**
 * AlertPanel — Módulo 6: Sistema de Notificaciones
 * 
 * specs_capa4.md §1 Módulo 6 + §2 Panel de alertas:
 * - Panel flotante de alertas CRITICO / ALTO
 * - Detalle de evento con imagen de evidencia
 * - "Marcar como revisado"
 * - Sonido de alerta para CRITICO/ALTO
 * - Browser notifications (Notification API)
 * - Historial de alertas pasadas
 */
export const AlertPanel = () => {
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    const unsub = mqttClient.subscribeToPattern('alertas', (payload) => {
      // Solo alertas CRITICO y ALTO como modales flotantes
      if (payload.severity === 'CRITICO' || payload.severity === 'ALTO') {
        const newAlert = {
          id: Date.now(),
          ...payload,
          time: new Date().toLocaleTimeString('es-PE'),
          timestamp_utc: new Date().toISOString(),
        };
        setLiveAlerts(prev => [newAlert, ...prev]);

        // Notificación browser + sonido
        notificationService.notifyAccess(payload);

        // Persistir en store
        dataStore.addAlert(payload);
      }
    });

    return unsub;
  }, []);

  useEffect(() => {
    notificationService.setSoundEnabled(soundEnabled);
  }, [soundEnabled]);

  const dismissAlert = (id) => {
    setLiveAlerts(prev => prev.filter(a => a.id !== id));
  };

  const markAsReviewed = (alert) => {
    // Resolver en el store
    if (alert.store_id) {
      dataStore.resolveAlert(alert.store_id);
    }
    dismissAlert(alert.id);
  };

  if (liveAlerts.length === 0) return null;

  return (
    <>
      <div style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '400px',
        maxHeight: '80vh',
        overflowY: 'auto',
      }}>
        {/* Sound Toggle */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
        }}>
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            style={{
              background: 'rgba(30, 41, 59, 0.9)', border: '1px solid rgba(255,255,255,0.1)',
              color: soundEnabled ? 'var(--accent-cyan)' : 'var(--text-muted)',
              borderRadius: '8px', padding: '6px 12px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem',
              backdropFilter: 'blur(10px)',
            }}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            Sonido {soundEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Alert Cards */}
        {liveAlerts.map(alert => (
          <div key={alert.id}
            className={`slide-in ${alert.severity === 'CRITICO' ? 'alert-critical' : ''}`}
            style={{
              background: 'rgba(30, 41, 59, 0.95)',
              backdropFilter: 'blur(20px)',
              border: `1px solid ${alert.severity === 'CRITICO' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(249, 115, 22, 0.4)'}`,
              borderLeft: `4px solid ${alert.severity === 'CRITICO' ? 'var(--severity-critico)' : 'var(--severity-alto)'}`,
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <AlertTriangle
                  size={22}
                  color={alert.severity === 'CRITICO' ? 'var(--severity-critico)' : 'var(--severity-alto)'}
                />
                <div>
                  <strong style={{
                    fontSize: '1rem',
                    color: alert.severity === 'CRITICO' ? 'var(--severity-critico)' : 'var(--severity-alto)',
                  }}>
                    ALERTA {alert.severity}
                  </strong>
                </div>
              </div>
              <button onClick={() => dismissAlert(alert.id)} style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', padding: '4px', borderRadius: '4px',
              }}>
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '0.9rem' }}>
                <strong>{alert.event_type?.replace(/_/g, ' ')}</strong>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Nodo: <strong>{alert.node_id}</strong>
              </div>
              {alert.user_id && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Usuario: #{alert.user_id}
                </div>
              )}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                {alert.time}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                className="btn btn-ghost btn-sm"
                style={{ flex: 1 }}
                onClick={() => setSelectedEvent(alert)}
              >
                <Eye size={14} /> Ver Detalle
              </button>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
                onClick={() => markAsReviewed(alert)}
              >
                <CheckCircle size={14} /> Revisado
              </button>
            </div>
          </div>
        ))}
      </div>

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        getUserName={(id) => dataStore.getUserName(id)}
        getNodeName={(id) => dataStore.getNodeName(id)}
      />
    </>
  );
};
