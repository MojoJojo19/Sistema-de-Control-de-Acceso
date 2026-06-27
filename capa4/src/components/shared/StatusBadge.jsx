import React from 'react';

/**
 * StatusBadge — Badge reutilizable para estados
 * 
 * Soporta: ONLINE, OFFLINE, DEGRADADO, RECONECTADO,
 *          ACTIVO, BLOQUEADO, SUSPENDIDO,
 *          GRANT, DENY,
 *          CRITICO, ALTO, MEDIO, BAJO, INFO
 */

const STATUS_CONFIG = {
  // Node states
  ONLINE: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', label: 'ONLINE' },
  OFFLINE: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'OFFLINE' },
  DEGRADADO: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'DEGRADADO' },
  RECONECTADO: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', label: 'RECONECTADO' },
  // User states
  ACTIVO: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', label: 'ACTIVO' },
  BLOQUEADO: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'BLOQUEADO' },
  SUSPENDIDO: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'SUSPENDIDO' },
  // Decisions
  GRANT: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', label: 'GRANT' },
  DENY: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'DENY' },
  // Severities
  CRITICO: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'CRÍTICO' },
  ALTO: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', label: 'ALTO' },
  MEDIO: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'MEDIO' },
  BAJO: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', label: 'BAJO' },
  INFO: { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', label: 'INFO' },
  // Sync mode
  SYNC: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', label: 'SYNC' },
};

export const StatusBadge = ({ status, size = 'md', pulse = false, showDot = false }) => {
  const config = STATUS_CONFIG[status] || { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', label: status };
  
  const sizes = {
    sm: { padding: '2px 8px', fontSize: '0.7rem' },
    md: { padding: '4px 12px', fontSize: '0.8rem' },
    lg: { padding: '6px 16px', fontSize: '0.9rem' },
  };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      ...sizes[size],
      borderRadius: '20px',
      fontWeight: 600,
      letterSpacing: '0.02em',
      background: config.bg,
      color: config.color,
      border: `1px solid ${config.color}22`,
      animation: pulse ? 'pulse-badge 2s infinite' : 'none',
      whiteSpace: 'nowrap',
    }}>
      {showDot && (
        <span style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: config.color,
          boxShadow: pulse ? `0 0 8px ${config.color}` : 'none',
        }} />
      )}
      {config.label}
    </span>
  );
};
