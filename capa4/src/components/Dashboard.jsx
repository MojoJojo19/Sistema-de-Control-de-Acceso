import React, { useState, useEffect } from 'react';
import { Activity, ShieldCheck, ShieldAlert, Cpu } from 'lucide-react';
import { mqttClient } from '../services/mqttClient';

export const Dashboard = () => {
  const [events, setEvents] = useState([
    { id: 1, node: 'ESP32_MAIN', user: 'Alice', decision: 'GRANT', time: new Date().toLocaleTimeString(), score: 0.88 },
  ]);
  
  const [nodes, setNodes] = useState({
    'ESP32_MAIN': { status: 'ONLINE', lastHeartbeat: new Date().toLocaleTimeString() }
  });

  useEffect(() => {
    // Escuchar eventos de acceso
    mqttClient.subscribeToPattern('accesos', (payload) => {
      setEvents(prev => [{
        id: Date.now(),
        node: payload.node_id || 'Unknown',
        user: payload.user || 'Unknown',
        decision: payload.decision,
        time: new Date().toLocaleTimeString(),
        score: payload.similarity_score || 0
      }, ...prev].slice(0, 10)); // Mantener solo los últimos 10
    });

    // Escuchar heartbeats
    mqttClient.subscribeToPattern('heartbeats', (payload) => {
      setNodes(prev => ({
        ...prev,
        [payload.nodeId]: { status: 'ONLINE', lastHeartbeat: new Date().toLocaleTimeString() }
      }));
    });
  }, []);

  return (
    <div className="dashboard slide-in">
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', color: 'var(--accent-cyan)' }}>Centro de Operaciones Biométricas</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Monitoreo en tiempo real de nodos y accesos</p>
      </header>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <ShieldCheck size={32} color="var(--status-online)" />
          <div>
            <h3 style={{ fontSize: '1.5rem' }}>99.8%</h3>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>FAR / Seguridad</span>
          </div>
        </div>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Activity size={32} color="var(--accent-cyan)" />
          <div>
            <h3 style={{ fontSize: '1.5rem' }}>184 ms</h3>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Latencia Media</span>
          </div>
        </div>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Cpu size={32} color="var(--accent-purple)" />
          <div>
            <h3 style={{ fontSize: '1.5rem' }}>{Object.keys(nodes).length}</h3>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Nodos Activos</span>
          </div>
        </div>
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <ShieldAlert size={32} color="var(--status-offline)" />
          <div>
            <h3 style={{ fontSize: '1.5rem' }}>0</h3>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Alertas Críticas Hoy</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
        {/* Live Feed */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-online)', boxShadow: '0 0 10px var(--status-online)' }} />
            Feed de Accesos en Vivo
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {events.map(ev => (
              <div key={ev.id} style={{
                display: 'flex', justifyContent: 'space-between', padding: '1rem',
                background: 'rgba(255,255,255,0.03)', borderRadius: '8px',
                borderLeft: `4px solid ${ev.decision === 'GRANT' ? 'var(--status-online)' : 'var(--status-offline)'}`
              }}>
                <div>
                  <strong style={{ display: 'block', fontSize: '1.1rem' }}>{ev.user}</strong>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{ev.node}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ 
                    display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                    background: ev.decision === 'GRANT' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    color: ev.decision === 'GRANT' ? 'var(--status-online)' : 'var(--status-offline)'
                  }}>
                    {ev.decision}
                  </span>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Score: {ev.score.toFixed(2)} | {ev.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Node Status */}
        <div className="glass-panel">
          <h3 style={{ marginBottom: '1rem' }}>Estado de Nodos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Object.entries(nodes).map(([id, data]) => (
              <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                <div>
                  <strong style={{ display: 'block' }}>{id}</strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Heartbeat: {data.lastHeartbeat}</span>
                </div>
                <span style={{ 
                  color: data.status === 'ONLINE' ? 'var(--status-online)' : 'var(--status-offline)',
                  fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px'
                }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
                  {data.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
