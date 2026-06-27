import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Plus, Unlock, History, MapPin, RefreshCw, Clock, WifiOff, Wifi, CheckCircle } from 'lucide-react';
import { mqttClient } from '../services/mqttClient';
import { dataStore } from '../services/dataStore';
import { StatusBadge } from './shared/StatusBadge';
import { Modal } from './shared/Modal';

/**
 * NodeManager — Módulo 5: Gestión de Nodos
 * 
 * specs_capa4.md §1 Módulo 5:
 * - Registro de nodos ESP32-S3 (autoconfigurable en < 1 min)
 * - Estado en tiempo real: ONLINE / OFFLINE / DEGRADADO con heartbeat
 * - Desbloqueo manual de nodo (SPOOFING 60s, BRUTE_FORCE 300s)
 * - Historial de desconexiones con duración y registros sincronizados
 * - Acuse de reconexión ("marcar como revisado")
 */
export const NodeManager = () => {
  const [nodes, setNodes] = useState([]);
  const [showAddNode, setShowAddNode] = useState(false);
  const [showHistory, setShowHistory] = useState(null);
  const [newNode, setNewNode] = useState({ id: '', nombre: '', ubicacion: '' });
  const [disconnectEvents, setDisconnectEvents] = useState([]);

  const loadNodes = useCallback(() => {
    setNodes(dataStore.getNodes());
  }, []);

  useEffect(() => {
    loadNodes();

    const unsubs = [
      mqttClient.subscribeToPattern('heartbeats', (payload) => {
        dataStore.updateNodeHeartbeat(payload.nodeId);
        loadNodes();
      }),
      mqttClient.subscribeToPattern('reconnect', (payload) => {
        dataStore.updateNode(payload.nodeId, { estado: 'RECONECTADO' });
        loadNodes();
      }),
    ];

    // Check heartbeat timeouts cada 15s
    const interval = setInterval(() => {
      const currentNodes = dataStore.getNodes();
      currentNodes.forEach(node => {
        if (node.estado === 'ONLINE' || node.estado === 'DEGRADADO') {
          const diff = Date.now() - new Date(node.ultimo_heartbeat).getTime();
          if (diff > 90000) {
            dataStore.updateNode(node.id, { estado: 'OFFLINE', timeout_count: node.timeout_count + 1 });
          } else if (diff > 45000) {
            dataStore.updateNode(node.id, { estado: 'DEGRADADO', timeout_count: node.timeout_count + 1 });
          }
        }
      });
      loadNodes();
    }, 15000);

    return () => {
      unsubs.forEach(u => u());
      clearInterval(interval);
    };
  }, [loadNodes]);

  const handleAddNode = (e) => {
    e.preventDefault();
    if (newNode.id && newNode.nombre) {
      dataStore.addNode(newNode);
      setShowAddNode(false);
      setNewNode({ id: '', nombre: '', ubicacion: '' });
      loadNodes();
    }
  };

  const handleUnlock = (nodeId) => {
    dataStore.unlockNode(nodeId);
    dataStore.updateNode(nodeId, { estado: 'ONLINE' });
    loadNodes();
  };

  const handleShowHistory = (node) => {
    const history = dataStore.getDisconnectHistory(node.id);
    setDisconnectEvents(history);
    setShowHistory(node);
  };

  const getTimeSince = (ts) => {
    if (!ts) return '—';
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return `${Math.floor(diff / 1000)}s atrás`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m atrás`;
    return `${Math.floor(diff / 3600000)}h atrás`;
  };

  const getStatusIcon = (estado) => {
    switch (estado) {
      case 'ONLINE': return <Wifi size={20} color="var(--status-online)" />;
      case 'OFFLINE': return <WifiOff size={20} color="var(--status-offline)" />;
      case 'DEGRADADO': return <Wifi size={20} color="var(--status-warning)" />;
      case 'RECONECTADO': return <RefreshCw size={20} color="var(--accent-cyan)" />;
      default: return <Cpu size={20} />;
    }
  };

  const onlineCount = nodes.filter(n => n.estado === 'ONLINE').length;
  const offlineCount = nodes.filter(n => n.estado === 'OFFLINE').length;
  const degradedCount = nodes.filter(n => n.estado === 'DEGRADADO').length;

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1><Cpu style={{ display: 'inline', verticalAlign: 'middle', marginRight: '10px' }} color="var(--accent-cyan)" size={28} />Gestión de Nodos</h1>
        <p>Monitoreo de nodos ESP32-S3, heartbeats, desbloqueo manual y reconexiones</p>
      </div>

      {/* Summary Cards */}
      <div className="kpi-grid stagger" style={{ marginBottom: '1.5rem' }}>
        <div className="glass-panel kpi-card slide-up">
          <div className="kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
            <Wifi size={22} color="var(--status-online)" />
          </div>
          <div>
            <h3>{onlineCount}</h3>
            <span>Online</span>
          </div>
        </div>
        <div className="glass-panel kpi-card slide-up">
          <div className="kpi-icon" style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
            <Wifi size={22} color="var(--status-warning)" />
          </div>
          <div>
            <h3>{degradedCount}</h3>
            <span>Degradados</span>
          </div>
        </div>
        <div className="glass-panel kpi-card slide-up">
          <div className="kpi-icon" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
            <WifiOff size={22} color="var(--status-offline)" />
          </div>
          <div>
            <h3>{offlineCount}</h3>
            <span>Offline</span>
          </div>
        </div>
        <div className="glass-panel kpi-card slide-up">
          <div className="kpi-icon" style={{ background: 'rgba(139, 92, 246, 0.15)' }}>
            <Cpu size={22} color="var(--accent-purple)" />
          </div>
          <div>
            <h3>{nodes.length}</h3>
            <span>Total Nodos</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary" onClick={() => setShowAddNode(true)}>
          <Plus size={18} /> Registrar Nodo
        </button>
      </div>

      {/* Node Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '1rem' }}>
        {nodes.map(node => (
          <div key={node.id} className={`glass-panel-static ${node.estado === 'OFFLINE' ? 'alert-critical' : ''}`}
            style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {getStatusIcon(node.estado)}
                <div>
                  <h3 style={{ fontSize: '1.05rem', marginBottom: '2px' }}>{node.nombre}</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{node.id}</div>
                </div>
              </div>
              <StatusBadge status={node.estado} showDot pulse={node.estado === 'ONLINE'} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <MapPin size={14} />
                <span className="truncate">{node.ubicacion || '—'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <Clock size={14} />
                <span>HB: {getTimeSince(node.ultimo_heartbeat)}</span>
              </div>
            </div>

            {/* Uptime Bar */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Uptime</span>
                <span style={{ fontWeight: 600, color: node.uptime_percent >= 99 ? 'var(--status-online)' : node.uptime_percent >= 95 ? 'var(--status-warning)' : 'var(--status-offline)' }}>
                  {node.uptime_percent?.toFixed(1)}%
                </span>
              </div>
              <div style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)' }}>
                <div style={{
                  width: `${node.uptime_percent || 0}%`, height: '100%', borderRadius: '2px',
                  background: node.uptime_percent >= 99 ? 'var(--status-online)' : node.uptime_percent >= 95 ? 'var(--status-warning)' : 'var(--status-offline)',
                  transition: 'width 0.5s',
                }} />
              </div>
            </div>

            {/* Blocked Alert */}
            {node.blocked_until && new Date(node.blocked_until) > new Date() && (
              <div style={{
                padding: '8px 12px', borderRadius: '8px', marginBottom: '0.75rem',
                background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                fontSize: '0.8rem', color: 'var(--status-offline)',
              }}>
                🔒 Bloqueado: {node.block_reason} — Expira: {new Date(node.blocked_until).toLocaleTimeString()}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => handleShowHistory(node)}>
                <History size={14} /> Historial
              </button>
              {(node.estado === 'OFFLINE' || node.blocked_until) && (
                <button className="btn btn-success btn-sm" onClick={() => handleUnlock(node.id)}>
                  <Unlock size={14} /> Desbloquear
                </button>
              )}
              {node.estado === 'RECONECTADO' && (
                <button className="btn btn-primary btn-sm" onClick={() => {
                  dataStore.updateNode(node.id, { estado: 'ONLINE' });
                  loadNodes();
                }}>
                  <CheckCircle size={14} /> Marcar Revisado
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Add Node Modal */}
      <Modal isOpen={showAddNode} onClose={() => setShowAddNode(false)} title="Registrar Nuevo Nodo ESP32-S3" maxWidth="500px">
        <form onSubmit={handleAddNode}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="label">ID del Nodo *</label>
              <input className="input" required placeholder="ESP32-S3-PUERTA-XX"
                value={newNode.id} onChange={e => setNewNode(p => ({ ...p, id: e.target.value }))} />
            </div>
            <div>
              <label className="label">Nombre *</label>
              <input className="input" required placeholder="Ej: Puerta Laboratorio 301"
                value={newNode.nombre} onChange={e => setNewNode(p => ({ ...p, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="label">Ubicación</label>
              <input className="input" placeholder="Ej: Edificio B, Piso 3, Lab 301"
                value={newNode.ubicacion} onChange={e => setNewNode(p => ({ ...p, ubicacion: e.target.value }))} />
            </div>
            <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--status-online)' }}>⚡ Autoconfiguración:</strong> El nodo se detecta automáticamente en {'<'} 1 minuto según §6.1 del documento.
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddNode(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary"><Plus size={16} /> Registrar</button>
            </div>
          </div>
        </form>
      </Modal>

      {/* History Modal */}
      <Modal isOpen={!!showHistory} onClose={() => setShowHistory(null)} title={`Historial — ${showHistory?.nombre}`} maxWidth="600px">
        {showHistory && (
          <div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '10px 16px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-offline)' }}>{showHistory.timeout_count}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Timeouts</div>
              </div>
              <div style={{ padding: '10px 16px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-online)' }}>{showHistory.uptime_percent?.toFixed(1)}%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Uptime</div>
              </div>
            </div>

            {disconnectEvents.length === 0 ? (
              <div className="empty-state">
                <CheckCircle size={32} color="var(--status-online)" />
                <span>Sin eventos de desconexión registrados</span>
              </div>
            ) : (
              <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Evento</th>
                      <th>Sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disconnectEvents.map(ev => (
                      <tr key={ev.id}>
                        <td style={{ fontSize: '0.8rem' }}>{new Date(ev.timestamp_utc).toLocaleString('es-PE')}</td>
                        <td style={{ fontSize: '0.8rem' }}>{ev.event_type}</td>
                        <td>{ev.sync_mode === 1 ? <StatusBadge status="SYNC" size="sm" /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
