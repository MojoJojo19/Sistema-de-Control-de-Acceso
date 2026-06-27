import React from 'react';
import { Modal } from './Modal';
import { StatusBadge } from './StatusBadge';
import { ShieldAlert, User, Cpu, Clock, Activity, Eye } from 'lucide-react';

/**
 * EventDetailModal — Vista completa de un evento de acceso
 * 
 * Muestra: imagen de evidencia (si aplica), scores, metadatos, nodo, usuario
 * Según specs_capa4.md §2 — Vista "Detalle de evento"
 */
export const EventDetailModal = ({ event, onClose, getUserName, getNodeName }) => {
  if (!event) return null;

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('es-PE', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const infoRow = (icon, label, value) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ color: 'var(--accent-cyan)', minWidth: '20px', display: 'flex' }}>{icon}</span>
      <span style={{ color: 'var(--text-secondary)', minWidth: '140px', fontSize: '0.9rem' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );

  return (
    <Modal isOpen={!!event} onClose={onClose} title="Detalle del Evento" maxWidth="650px">
      {/* Severity Banner */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderRadius: '10px',
        marginBottom: '1.5rem',
        background: event.severity === 'CRITICO' ? 'rgba(239, 68, 68, 0.1)' :
                     event.severity === 'ALTO' ? 'rgba(249, 115, 22, 0.1)' :
                     'rgba(139, 92, 246, 0.1)',
        border: `1px solid ${event.severity === 'CRITICO' ? 'rgba(239, 68, 68, 0.3)' :
                              event.severity === 'ALTO' ? 'rgba(249, 115, 22, 0.3)' :
                              'rgba(139, 92, 246, 0.3)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={24} />
          <div>
            <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{event.event_type?.replace(/_/g, ' ')}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>ID del evento: #{event.id}</div>
          </div>
        </div>
        <StatusBadge status={event.severity} size="lg" />
      </div>

      {/* Metadata */}
      <div style={{ marginBottom: '1.5rem' }}>
        {infoRow(<Clock size={16} />, 'Timestamp', formatDate(event.timestamp_utc || event.timestamp))}
        {infoRow(<Cpu size={16} />, 'Nodo', `${event.node_id} ${getNodeName ? `(${getNodeName(event.node_id)})` : ''}`)}
        {infoRow(<User size={16} />, 'Usuario', event.user_id ? `#${event.user_id} ${getUserName ? `— ${getUserName(event.user_id)}` : ''}` : 'No identificado')}
        {infoRow(<ShieldAlert size={16} />, 'Decisión', <StatusBadge status={event.decision} />)}
        {infoRow(<Activity size={16} />, 'Score Similitud', event.similarity_score !== undefined ? (event.similarity_score * 1).toFixed(4) : '—')}
        {infoRow(<Eye size={16} />, 'Score Liveness', event.liveness_score !== undefined ? (event.liveness_score * 1).toFixed(3) : '—')}
        {event.pipeline_ms !== undefined && infoRow(<Clock size={16} />, 'Latencia Pipeline', `${event.pipeline_ms.toFixed(1)} ms`)}
        {event.sync_mode === 1 && infoRow(<Activity size={16} />, 'Modo', <StatusBadge status="SYNC" />)}
      </div>

      {/* Evidence Image */}
      {event.has_evidence && (
        <div style={{
          padding: '1rem',
          borderRadius: '10px',
          background: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <Eye size={18} color="var(--status-offline)" />
            <span style={{ fontWeight: 600, color: 'var(--status-offline)' }}>Evidencia de Spoofing</span>
          </div>
          <div style={{
            width: '100%', height: '200px',
            borderRadius: '8px',
            background: 'rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)', fontSize: '0.9rem',
          }}>
            Imagen de evidencia almacenada en BD (BLOB)
          </div>
        </div>
      )}
    </Modal>
  );
};
