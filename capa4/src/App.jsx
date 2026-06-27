import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ShieldAlert, Settings, Cpu, FileText, BarChart3, Wifi, WifiOff, Clock } from 'lucide-react';
import { mqttClient } from './services/mqttClient';
import { notificationService } from './services/notificationService';
import { dataStore } from './services/dataStore';
import { Dashboard } from './components/Dashboard';
import { AlertPanel } from './components/AlertPanel';
import { UserManager } from './components/UserManager';
import { AuditLog } from './components/AuditLog';
import { MetricsPanel } from './components/MetricsPanel';
import { NodeManager } from './components/NodeManager';
import { Settings as SettingsPage } from './components/Settings';
import './App.css';

/**
 * Sidebar — Navegación principal con indicadores de estado
 */
const Sidebar = () => {
  const location = useLocation();
  const [unresolvedCount, setUnresolvedCount] = useState(0);

  useEffect(() => {
    const update = () => setUnresolvedCount(dataStore.getAlerts(true).length);
    update();
    const unsub = dataStore.on('alerts_updated', update);
    return unsub;
  }, []);

  const menuItems = [
    { path: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { path: '/users', icon: <Users size={20} />, label: 'Identidades' },
    { path: '/nodes', icon: <Cpu size={20} />, label: 'Nodos' },
    { path: '/audit', icon: <FileText size={20} />, label: 'Auditoría' },
    { path: '/metrics', icon: <BarChart3 size={20} />, label: 'Métricas' },
    { path: '/settings', icon: <Settings size={20} />, label: 'Configuración' },
  ];

  return (
    <div className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <ShieldAlert size={20} color="white" />
        </div>
        <h2 className="sidebar-title">SmartAccess</h2>
      </div>

      {/* Navigation */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
        {menuItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path} className={`nav-link ${isActive ? 'active' : ''}`}>
              {item.icon}
              <span className="nav-label">{item.label}</span>
              {/* Alert badge en Dashboard */}
              {item.path === '/' && unresolvedCount > 0 && (
                <span className="nav-badge">{unresolvedCount}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-info">
          <ShieldAlert size={14} color="var(--accent-cyan)" />
          <span className="nav-label">UNMSM · FISI · Grupo 1</span>
        </div>
      </div>
    </div>
  );
};

/**
 * TopBar — Barra superior con estado de conexión y reloj
 */
const TopBar = () => {
  const [mqttState, setMqttState] = useState('disconnected');
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const unsub = mqttClient.onStateChange(setMqttState);
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => { unsub(); clearInterval(timer); };
  }, []);

  return (
    <div className="top-bar">
      <div />
      <div className="top-bar-right">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <Clock size={15} />
          {time.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div className={`mqtt-status ${mqttState === 'connected' ? 'connected' : 'disconnected'}`}>
          {mqttState === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>MQTT {mqttState === 'connected' ? 'Online' : 'Offline'}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * App — Componente principal con routing completo
 */
function App() {
  useEffect(() => {
    // Inicializar servicios
    mqttClient.connect();
    notificationService.init();

    return () => mqttClient.disconnect();
  }, []);

  return (
    <BrowserRouter>
      <div className="app-container">
        <AlertPanel />
        <Sidebar />
        <main className="main-content">
          <TopBar />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/users" element={<UserManager />} />
            <Route path="/nodes" element={<NodeManager />} />
            <Route path="/audit" element={<AuditLog />} />
            <Route path="/metrics" element={<MetricsPanel />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
