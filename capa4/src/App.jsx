import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, ShieldAlert, Settings } from 'lucide-react';
import { mqttClient } from './services/mqttClient';
import { Dashboard } from './components/Dashboard';
import { AlertPanel } from './components/AlertPanel';
import { UserManager } from './components/UserManager';

const Sidebar = () => {
  const location = useLocation();
  const menuItems = [
    { path: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { path: '/users', icon: <Users size={20} />, label: 'Identidades' },
    { path: '/audit', icon: <ShieldAlert size={20} />, label: 'Auditoría' },
    { path: '/settings', icon: <Settings size={20} />, label: 'Configuración' },
  ];

  return (
    <div className="sidebar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '3rem' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShieldAlert size={20} color="black" />
        </div>
        <h2 style={{ fontSize: '1.2rem', margin: 0 }}>SmartAccess</h2>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {menuItems.map(item => {
          const isActive = location.pathname === item.path;
          return (
            <Link key={item.path} to={item.path} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '12px 16px', borderRadius: '8px',
              textDecoration: 'none',
              background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'var(--transition)'
            }}>
              {item.icon}
              <span style={{ fontWeight: isActive ? '600' : '400' }}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

function App() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    mqttClient.connect();
    // Simulamos que se conecta (idealmente mqttClient debería emitir un evento state)
    setTimeout(() => setConnected(true), 1000);

    return () => mqttClient.disconnect();
  }, []);

  return (
    <BrowserRouter>
      <div className="app-container">
        <AlertPanel />
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/users" element={<UserManager />} />
            {/* Rutas placeholder */}
            <Route path="/audit" element={<h2 className="slide-in">Módulo de Auditoría en Construcción</h2>} />
            <Route path="/settings" element={<h2 className="slide-in">Configuración del Sistema</h2>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
