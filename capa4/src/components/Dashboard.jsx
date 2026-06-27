import React, { useState, useEffect, useCallback } from 'react';
import { Activity, ShieldCheck, ShieldAlert, Cpu, Clock, Eye, TrendingUp } from 'lucide-react';
import { mqttClient } from '../services/mqttClient';
import { dataStore } from '../services/dataStore';
import { StatusBadge } from './shared/StatusBadge';
import { EventDetailModal } from './shared/EventDetailModal';

/**
 * Dashboard — Módulo 1: Dashboard en Tiempo Real
 * 
 * specs_capa4.md §1 Módulo 1:
 * - Estado de nodos: ONLINE / DEGRADADO / OFFLINE / RECONECTADO
 * - Feed de eventos en vivo con timestamp, ID usuario, ID nodo, decisión, score
 * - Alertas activas no resueltas por severidad
 * - Actualización automática vía MQTT (SLA < 500ms)
 */
export const Dashboard = () => {
  const [events, setEvents] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const loadData = useCallback(() => {
    const logs = dataStore.getLogs();
    setEvents(logs.slice(0, 20));
    setNodes(dataStore.getNodes());
    setAlerts(dataStore.getAlerts(true));
    setMetrics(dataStore.getMetrics());
  }, []);

  useEffect(() => {
    loadData();

    // Suscribir a eventos en tiempo real
    const unsubs = [
      mqttClient.subscribeToPattern('accesos', (payload) => {
        const newEvent = {
          id: Date.now(),
          node_id: payload.node_id || payload.doorId || 'Unknown',
          user_id: payload.user_id,
          user: payload.user || 'Unknown',
          decision: payload.decision,
          event_type: payload.event_type || 'SUCCESSFUL_ACCESS',
          severity: payload.severity || 'INFO',
          similarity_score: payload.similarity_score || 0,
          liveness_score: payload.liveness_score || 0,
          pipeline_ms: payload.pipeline_ms || 0,
          timestamp_utc: new Date().toISOString(),
        };
        dataStore.addLog(newEvent);
        setEvents(prev => [newEvent, ...prev].slice(0, 20));
      }),
      mqttClient.subscribeToPattern('heartbeats', (payload) => {
        dataStore.updateNodeHeartbeat(payload.nodeId);
        setNodes(dataStore.getNodes());
      }),
      mqttClient.subscribeToPattern('alertas', (payload) => {
        if (payload.severity === 'CRITICO' || payload.severity === 'ALTO') {
          dataStore.addAlert(payload);
          setAlerts(dataStore.getAlerts(true));
        }
      }),
    ];

    // Refresh periódico de métricas
    const interval = setInterval(() => {
      setMetrics(dataStore.getMetrics());
    }, 30000);

    return () => {
      unsubs.forEach(u => u());
      clearInterval(interval);
    };
  }, [loadData]);

  const formatTime = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatTimeSince = (ts) => {
    if (!ts) return '—';
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    return `${Math.floor(diff / 3600000)}h`;
  };

  const getNodeStatusColor = (estado) => {
    const colors = {
      ONLINE: 'var(--status-online)',
      OFFLINE: 'var(--status-offline)',
      DEGRADADO: 'var(--status-warning)',
      RECONECTADO: 'var(--accent-cyan)',
    };
    return colors[estado] || 'var(--text-muted)';
  };

  const onlineNodes = nodes.filter(n => n.estado === 'ONLINE').length;
  const unresolvedAlerts = alerts.length;

  return (
    <div className="fade-in">
      {/* Page Header */}
      <div className="page-header">
        <h1 style={{ color: 'var(--accent-cyan)' }}>Centro de Operaciones Biométricas</h1>
        <p>Monitoreo en tiempo real de nodos y accesos — Sistema de Control de Acceso Inteligente</p>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid stagger">
        <div className="glass-panel kpi-card slide-up">
          <div className="kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
            <ShieldCheck size={24} color="var(--status-online)" />
          </div>
          <div>
            <h3>{metrics ? `${(100 - metrics.far * 100).toFixed(1)}%` : '—'}</h3>
            <span>Seguridad (1-FAR)</span>
          </div>
        </div>

        <div className="glass-panel kpi-card slide-up">
          <div className="kpi-icon" style={{ background: 'rgba(6, 182, 212, 0.15)' }}>
            <Activity size={24} color="var(--accent-cyan)" />
          </div>
          <div>
            <h3>{metrics ? `${metrics.latency_avg_ms} ms` : '—'}</h3>
            <span>Latencia Media</span>
          </div>
        </div>

        <div className="glass-panel kpi-card slide-up">
          <div className="kpi-icon" style={{ background: 'rgba(139, 92, 246, 0.15)' }}>
            <Cpu size={24} color="var(--accent-purple)" />
          </div>
          <div>
            <h3>{onlineNodes} / {nodes.length}</h3>
            <span>Nodos Online</span>
          </div>
        </div>

        <div className="glass-panel kpi-card slide-up">
          <div className="kpi-icon" style={{ background: unresolvedAlerts > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }}>
            <ShieldAlert size={24} color={unresolvedAlerts > 0 ? 'var(--status-offline)' : 'var(--status-online)'} />
          </div>
          <div>
            <h3 style={{ color: unresolvedAlerts > 0 ? 'var(--status-offline)' : 'inherit' }}>{unresolvedAlerts}</h3>
            <span>Alertas Pendientes</span>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="dashboard-grid">
        {/* Live Event Feed */}
        <div className="glass-panel-static" style={{ maxHeight: '500px', display: 'flex', flexDirection: 'column' }}>
          <div className="section-header">
            <h3>
              <span className="live-dot" />
              Feed de Accesos en Vivo
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Últimos {events.length} eventos
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto', flex: 1 }}>
            {events.length === 0 ? (
              <div className="empty-state">
                <Activity size={32} />
                <span>Sin eventos recientes</span>
              </div>
            ) : (
              events.map(ev => (
                <div
                  key={ev.id}
                  className={`event-item ${ev.decision === 'GRANT' ? 'grant' : 'deny'}`}
                  onClick={() => setSelectedEvent(ev)}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <strong style={{ fontSize: '0.9rem' }}>
                        {ev.user_id ? dataStore.getUserName(ev.user_id) : (ev.user || 'Desconocido')}
                      </strong>
                      {ev.sync_mode === 1 && <StatusBadge status="SYNC" size="sm" />}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {ev.node_id} · {ev.event_type?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <StatusBadge status={ev.decision} size="sm" />
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {typeof ev.similarity_score === 'number' ? `${(ev.similarity_score).toFixed(2)}` : '—'} · {formatTime(ev.timestamp_utc)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Nodes + Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Node Status */}
          <div className="glass-panel-static">
            <div className="section-header">
              <h3><Cpu size={18} /> Estado de Nodos</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {nodes.map(node => (
                <div key={node.id} className="node-card">
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block', fontSize: '0.9rem', marginBottom: '2px' }}>{node.nombre}</strong>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {node.id} · HB: {formatTimeSince(node.ultimo_heartbeat)} atrás
                    </span>
                  </div>
                  <StatusBadge status={node.estado} size="sm" showDot pulse={node.estado === 'ONLINE'} />
                </div>
              ))}
            </div>
          </div>

          {/* Active Alerts Summary */}
          <div className="glass-panel-static">
            <div className="section-header">
              <h3><ShieldAlert size={18} color="var(--status-offline)" /> Alertas Activas</h3>
            </div>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                <ShieldCheck size={28} style={{ marginBottom: '8px' }} />
                <div style={{ fontSize: '0.85rem' }}>Sin alertas pendientes</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {alerts.slice(0, 5).map(alert => (
                  <div key={alert.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', borderRadius: '8px',
                    background: alert.severity === 'CRITICO' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(249, 115, 22, 0.08)',
                    borderLeft: `3px solid ${alert.severity === 'CRITICO' ? 'var(--severity-critico)' : 'var(--severity-alto)'}`,
                  }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{alert.event_type?.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {alert.node_id} · {formatTime(alert.timestamp)}
                      </div>
                    </div>
                    <StatusBadge status={alert.severity} size="sm" />
                  </div>
                ))}
                {alerts.length > 5 && (
                  <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', padding: '4px' }}>
                    +{alerts.length - 5} más...
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="glass-panel-static">
            <div className="section-header">
              <h3><TrendingUp size={18} /> Hoy</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--status-online)' }}>
                  {metrics?.total_grants_today || 0}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Accesos</div>
              </div>
              <div style={{ textAlign: 'center', padding: '8px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--status-offline)' }}>
                  {metrics?.total_denies_today || 0}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Rechazos</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        getUserName={(id) => dataStore.getUserName(id)}
        getNodeName={(id) => dataStore.getNodeName(id)}
      />
    </div>
  );
};
