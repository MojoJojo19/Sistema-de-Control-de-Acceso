import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Wifi, WifiOff, Server, Bell, BellOff, Volume2, VolumeX, RefreshCw, Database, Shield, Trash2, CheckCircle } from 'lucide-react';
import { mqttClient } from '../services/mqttClient';
import { fetchHealth } from '../services/api';
import { notificationService } from '../services/notificationService';
import { dataStore } from '../services/dataStore';

/**
 * Settings — Configuración del Sistema
 * 
 * specs_capa4.md extras:
 * - Estado de conexión MQTT
 * - Health check de Capa 3
 * - Configuración de notificaciones
 * - Reset de datos
 */
export const Settings = () => {
  const [mqttState, setMqttState] = useState('disconnected');
  const [apiHealth, setApiHealth] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifPermission, setNotifPermission] = useState('default');

  useEffect(() => {
    const unsub = mqttClient.onStateChange((state) => {
      setMqttState(state);
    });

    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
    }

    return unsub;
  }, []);

  const checkApiHealth = async () => {
    setApiLoading(true);
    const result = await fetchHealth();
    setApiHealth(result);
    setApiLoading(false);
  };

  useEffect(() => {
    checkApiHealth();
  }, []);

  const requestNotifPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
    }
  };

  const toggleNotifications = () => {
    const next = !notifEnabled;
    setNotifEnabled(next);
    notificationService.setEnabled(next);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    notificationService.setSoundEnabled(next);
  };

  const handleResetData = () => {
    if (window.confirm('¿Estás seguro de resetear todos los datos simulados? Esto eliminará logs, alertas y métricas.')) {
      dataStore.resetAll();
      window.location.reload();
    }
  };

  const StatusDot = ({ active }) => (
    <span style={{
      width: '8px', height: '8px', borderRadius: '50%',
      background: active ? 'var(--status-online)' : 'var(--status-offline)',
      boxShadow: active ? '0 0 8px var(--status-online)' : 'none',
      display: 'inline-block',
    }} />
  );

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1><SettingsIcon style={{ display: 'inline', verticalAlign: 'middle', marginRight: '10px' }} color="var(--accent-cyan)" size={28} />Configuración del Sistema</h1>
        <p>Estado de conexiones, notificaciones y administración del dashboard</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {/* MQTT Connection */}
        <div className="glass-panel-static">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {mqttState === 'connected' ? <Wifi size={18} color="var(--status-online)" /> : <WifiOff size={18} color="var(--status-offline)" />}
            Conexión MQTT (Capa 2)
          </h3>
          
          <div className="setting-row">
            <div>
              <div style={{ fontWeight: 500 }}>Estado</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>WebSocket al broker MQTT</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <StatusDot active={mqttState === 'connected'} />
              <span style={{ 
                fontWeight: 600, fontSize: '0.85rem',
                color: mqttState === 'connected' ? 'var(--status-online)' : 'var(--status-offline)',
              }}>
                {mqttState === 'connected' ? 'Conectado' : mqttState === 'reconnecting' ? 'Reconectando...' : 'Desconectado'}
              </span>
            </div>
          </div>

          <div className="setting-row">
            <div>
              <div style={{ fontWeight: 500 }}>Broker URL</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Dirección del broker MQTT</div>
            </div>
            <code style={{ fontSize: '0.8rem', padding: '4px 10px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
              ws://localhost:9001
            </code>
          </div>

          <div className="setting-row">
            <div>
              <div style={{ fontWeight: 500 }}>Topics suscritos</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Canales MQTT activos</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
              {['sistema/alertas/#', 'acceso/puerta/+/comando', 'sistema/nodos/+/heartbeat', 'sistema/nodos/+/reconnect'].map(t => (
                <code key={t} style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(6, 182, 212, 0.1)', borderRadius: '4px', color: 'var(--accent-cyan)' }}>
                  {t}
                </code>
              ))}
            </div>
          </div>

          {mqttState !== 'connected' && (
            <button className="btn btn-primary" style={{ marginTop: '1rem', width: '100%' }} onClick={() => mqttClient.connect()}>
              <RefreshCw size={16} /> Reconectar
            </button>
          )}
        </div>

        {/* API Health */}
        <div className="glass-panel-static">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={18} color="var(--accent-purple)" />
            API Capa 3 (Motor de IA)
          </h3>

          <div className="setting-row">
            <div>
              <div style={{ fontWeight: 500 }}>Estado del servidor</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Flask en localhost:5000</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <StatusDot active={apiHealth?.status === 'ok'} />
              <span style={{
                fontWeight: 600, fontSize: '0.85rem',
                color: apiHealth?.status === 'ok' ? 'var(--status-online)' : 'var(--status-offline)',
              }}>
                {apiHealth ? (apiHealth.status === 'ok' ? 'Operativo' : 'Error') : 'Sin respuesta'}
              </span>
            </div>
          </div>

          {apiHealth && (
            <>
              <div className="setting-row">
                <div>
                  <div style={{ fontWeight: 500 }}>Modelos IA</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>FaceMesh, MiniFASNet, MTCNN, InceptionResnetV1</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {apiHealth.models_loaded ? (
                    <><CheckCircle size={16} color="var(--status-online)" /> <span style={{ fontSize: '0.85rem', color: 'var(--status-online)' }}>Cargados</span></>
                  ) : (
                    <span style={{ fontSize: '0.85rem', color: 'var(--status-offline)' }}>No cargados</span>
                  )}
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <div style={{ fontWeight: 500 }}>FAISS Embeddings</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Vectores indexados en FAISS</div>
                </div>
                <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{apiHealth.faiss_embeddings}</span>
              </div>
            </>
          )}

          <button className="btn btn-ghost" style={{ marginTop: '1rem', width: '100%' }} onClick={checkApiHealth} disabled={apiLoading}>
            <RefreshCw size={16} className={apiLoading ? 'spinning' : ''} /> {apiLoading ? 'Consultando...' : 'Health Check'}
          </button>
        </div>

        {/* Notifications */}
        <div className="glass-panel-static">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={18} color="var(--accent-cyan)" />
            Notificaciones
          </h3>

          <div className="setting-row">
            <div>
              <div style={{ fontWeight: 500 }}>Notificaciones Browser</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Push notifications para alertas CRITICO/ALTO</div>
            </div>
            <button className={`toggle ${notifEnabled ? 'active' : ''}`} onClick={toggleNotifications} />
          </div>

          <div className="setting-row">
            <div>
              <div style={{ fontWeight: 500 }}>Sonido de Alertas</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Tono audible para eventos críticos</div>
            </div>
            <button className={`toggle ${soundEnabled ? 'active' : ''}`} onClick={toggleSound} />
          </div>

          <div className="setting-row">
            <div>
              <div style={{ fontWeight: 500 }}>Permiso del navegador</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Estado del permiso de notificaciones</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '0.85rem', fontWeight: 500,
                color: notifPermission === 'granted' ? 'var(--status-online)' : 'var(--status-warning)',
              }}>
                {notifPermission === 'granted' ? 'Concedido' : notifPermission === 'denied' ? 'Denegado' : 'Pendiente'}
              </span>
              {notifPermission !== 'granted' && (
                <button className="btn btn-ghost btn-sm" onClick={requestNotifPermission}>Solicitar</button>
              )}
            </div>
          </div>
        </div>

        {/* Data Management */}
        <div className="glass-panel-static">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={18} color="var(--status-warning)" />
            Datos y Almacenamiento
          </h3>

          <div className="setting-row">
            <div>
              <div style={{ fontWeight: 500 }}>Almacenamiento local</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Datos simulados en localStorage</div>
            </div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {dataStore.getUsers().length} usuarios · {dataStore.getNodes().length} nodos · {dataStore.getLogs().length} logs
            </span>
          </div>

          <div className="setting-row">
            <div>
              <div style={{ fontWeight: 500 }}>Base de datos (Capa 3)</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>SQLite / Oracle con HMAC-SHA256</div>
            </div>
            <code style={{ fontSize: '0.75rem', padding: '4px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
              capa3_dev.db
            </code>
          </div>

          <button className="btn btn-danger" style={{ marginTop: '1rem', width: '100%' }} onClick={handleResetData}>
            <Trash2 size={16} /> Resetear Datos Simulados
          </button>
        </div>
      </div>

      {/* System Info */}
      <div className="glass-panel-static" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Shield size={18} color="var(--accent-purple)" />
          Información del Sistema
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Proyecto</div>
            <div style={{ fontSize: '0.9rem' }}>Sistema de Control de Acceso Inteligente</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Universidad</div>
            <div style={{ fontSize: '0.9rem' }}>Universidad Nacional Mayor de San Marcos</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Capa</div>
            <div style={{ fontSize: '0.9rem' }}>Capa 4 — Capa de Aplicación</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Stack</div>
            <div style={{ fontSize: '0.9rem' }}>React 19 + Vite 8 + MQTT.js + Recharts</div>
          </div>
        </div>
      </div>
    </div>
  );
};
