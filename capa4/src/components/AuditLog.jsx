import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Search, Download, Filter, Eye, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { dataStore } from '../services/dataStore';
import { mqttClient } from '../services/mqttClient';
import { StatusBadge } from './shared/StatusBadge';
import { EventDetailModal } from './shared/EventDetailModal';

/**
 * AuditLog — Módulo 3: Auditoría de Accesos
 * 
 * specs_capa4.md §1 Módulo 3:
 * - Log completo de eventos: timestamp, usuario, nodo, decisión, scores
 * - Filtros avanzados: tipo de evento, severidad, nodo, usuario, rango de fechas
 * - Identificación visual de sync_mode = TRUE
 * - Visualización de evidencia de spoofing
 * - Exportación CSV/JSON
 * - Trazabilidad en tiempo real
 */
export const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    event_type: '', severity: '', node_id: '', decision: '', from: '', to: '',
  });
  const PAGE_SIZE = 15;

  const nodes = dataStore.getNodes();
  const users = dataStore.getUsers();

  const loadLogs = useCallback(() => {
    const cleanFilters = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) cleanFilters[k] = v; });
    const fetched = dataStore.getLogs(cleanFilters);
    setAllLogs(fetched);
    setLogs(fetched.slice(0, PAGE_SIZE));
    setPage(1);
  }, [filters]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    const unsub = mqttClient.subscribeToPattern('accesos', () => {
      loadLogs();
    });
    return unsub;
  }, [loadLogs]);

  const paginatedLogs = allLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(allLogs.length / PAGE_SIZE);

  const exportData = (format) => {
    const dataToExport = allLogs;
    let content, filename, type;

    if (format === 'csv') {
      const headers = 'ID,Timestamp,Nodo,Usuario,Evento,Severidad,Decisión,Score Similitud,Score Liveness,Sync Mode,Pipeline (ms)\n';
      const rows = dataToExport.map(l =>
        `${l.id},"${l.timestamp_utc}","${l.node_id}",${l.user_id || ''},"${l.event_type}","${l.severity}","${l.decision}",${l.similarity_score?.toFixed(4) || ''},${l.liveness_score?.toFixed(3) || ''},${l.sync_mode},${l.pipeline_ms?.toFixed(1) || ''}`
      ).join('\n');
      content = headers + rows;
      filename = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
      type = 'text/csv';
    } else {
      content = JSON.stringify(dataToExport, null, 2);
      filename = `audit_log_${new Date().toISOString().slice(0, 10)}.json`;
      type = 'application/json';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters({ event_type: '', severity: '', node_id: '', decision: '', from: '', to: '' });
  };

  const hasActiveFilters = Object.values(filters).some(v => v);

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1><FileText style={{ display: 'inline', verticalAlign: 'middle', marginRight: '10px' }} color="var(--accent-cyan)" size={28} />Auditoría de Accesos</h1>
        <p>Registro completo e inmutable de todos los eventos del sistema — Trazabilidad auditable</p>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="filter-group">
          <label className="label">Tipo de Evento</label>
          <select className="select" value={filters.event_type} onChange={e => updateFilter('event_type', e.target.value)}>
            <option value="">Todos</option>
            <option value="SUCCESSFUL_ACCESS">Acceso Exitoso</option>
            <option value="IDENTITY_MISMATCH">Identity Mismatch</option>
            <option value="SPOOFING_ATTEMPT">Spoofing Attempt</option>
            <option value="BRUTE_FORCE_DETECTED">Brute Force</option>
            <option value="ACCESS_OUT_OF_SCHEDULE">Fuera de Horario</option>
            <option value="LOW_QUALITY_FRAME">Baja Calidad</option>
            <option value="USER_INACTIVE">Usuario Inactivo</option>
            <option value="RATE_LIMIT_EXCEEDED">Rate Limit</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="label">Severidad</label>
          <select className="select" value={filters.severity} onChange={e => updateFilter('severity', e.target.value)}>
            <option value="">Todas</option>
            <option value="CRITICO">Crítico</option>
            <option value="ALTO">Alto</option>
            <option value="MEDIO">Medio</option>
            <option value="BAJO">Bajo</option>
            <option value="INFO">Info</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="label">Nodo</label>
          <select className="select" value={filters.node_id} onChange={e => updateFilter('node_id', e.target.value)}>
            <option value="">Todos</option>
            {nodes.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label className="label">Decisión</label>
          <select className="select" value={filters.decision} onChange={e => updateFilter('decision', e.target.value)}>
            <option value="">Todas</option>
            <option value="GRANT">GRANT</option>
            <option value="DENY">DENY</option>
          </select>
        </div>
        <div className="filter-group">
          <label className="label">Desde</label>
          <input className="input" type="date" value={filters.from ? filters.from.slice(0, 10) : ''} onChange={e => updateFilter('from', e.target.value)} />
        </div>
        <div className="filter-group">
          <label className="label">Hasta</label>
          <input className="input" type="date" value={filters.to ? filters.to.slice(0, 10) : ''} onChange={e => updateFilter('to', e.target.value ? e.target.value + 'T23:59:59' : '')} />
        </div>
        <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-end' }}>
          {hasActiveFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters} title="Limpiar filtros">
              <RefreshCw size={14} /> Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {allLogs.length} registros encontrados
          {hasActiveFilters && <span style={{ color: 'var(--accent-cyan)' }}> (filtros activos)</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => exportData('csv')}>
            <Download size={14} /> CSV
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => exportData('json')}>
            <Download size={14} /> JSON
          </button>
        </div>
      </div>

      {/* Log Table */}
      <div className="glass-panel-static">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Timestamp</th>
                <th>Nodo</th>
                <th>Usuario</th>
                <th>Evento</th>
                <th>Severidad</th>
                <th>Decisión</th>
                <th>Score</th>
                <th>Liveness</th>
                <th>Latencia</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.map(log => (
                <tr key={log.id} style={log.sync_mode === 1 ? { background: 'rgba(6, 182, 212, 0.04)' } : {}}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{log.id}</td>
                  <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {new Date(log.timestamp_utc).toLocaleString('es-PE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>{log.node_id?.replace('ESP32-S3-', '')}</td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {log.user_id ? dataStore.getUserName(log.user_id) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.8rem' }}>{log.event_type?.replace(/_/g, ' ')}</span>
                      {log.sync_mode === 1 && <StatusBadge status="SYNC" size="sm" />}
                    </div>
                  </td>
                  <td><StatusBadge status={log.severity} size="sm" /></td>
                  <td><StatusBadge status={log.decision} size="sm" /></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.similarity_score?.toFixed(3) || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.liveness_score?.toFixed(3) || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.pipeline_ms ? `${log.pipeline_ms.toFixed(0)}ms` : '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn-icon" title="Ver detalle" onClick={() => setSelectedEvent(log)} style={{ width: '28px', height: '28px' }}>
                        <Eye size={14} />
                      </button>
                      {log.has_evidence && (
                        <button className="btn-icon" title="Ver evidencia" style={{ width: '28px', height: '28px', color: 'var(--status-offline)' }}>
                          <Eye size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedLogs.length === 0 && (
                <tr>
                  <td colSpan={11}>
                    <div className="empty-state">
                      <FileText size={32} />
                      <span>No se encontraron registros con los filtros aplicados</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft size={14} />
            </button>
            <span>Página {page} de {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      <EventDetailModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        getUserName={(id) => dataStore.getUserName(id)}
        getNodeName={(id) => dataStore.getNodeName(id)}
      />
    </div>
  );
};
