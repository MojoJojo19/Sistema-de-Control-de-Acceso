import React, { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Lock, Unlock, Search, Clock, Edit, X, History, Shield } from 'lucide-react';
import { dataStore } from '../services/dataStore';
import { enrollUser } from '../services/api';
import { StatusBadge } from './shared/StatusBadge';
import { Modal } from './shared/Modal';

/**
 * UserManager — Módulo 2: Gestión de Usuarios
 * 
 * specs_capa4.md §1 Módulo 2:
 * - Registro de usuario con captura de embedding facial
 * - Estados: ACTIVO / BLOQUEADO / SUSPENDIDO
 * - Horarios de acceso por usuario
 * - Bloqueo / Desbloqueo manual
 * - Historial de accesos por usuario
 */
export const UserManager = () => {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showEnroll, setShowEnroll] = useState(false);
  const [showHistory, setShowHistory] = useState(null);
  const [showEdit, setShowEdit] = useState(null);
  const [enrollForm, setEnrollForm] = useState({ nombre: '', email: '', horario_inicio: '07:00', horario_fin: '20:00', role: 'Staff' });
  const [historyLogs, setHistoryLogs] = useState([]);

  const loadUsers = useCallback(() => {
    setUsers(dataStore.getUsers());
  }, []);

  useEffect(() => {
    loadUsers();
    const unsub = dataStore.on('users_updated', loadUsers);
    return unsub;
  }, [loadUsers]);

  const filteredUsers = users.filter(u => {
    const matchSearch = u.nombre.toLowerCase().includes(search.toLowerCase()) ||
                        u.email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || u.estado === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleToggleStatus = (userId) => {
    dataStore.toggleUserStatus(userId);
    loadUsers();
  };

  const handleEnroll = (e) => {
    e.preventDefault();
    // Agregar al store local (la integración con /enroll de la API se activa cuando hay imágenes)
    dataStore.addUser(enrollForm);
    setShowEnroll(false);
    setEnrollForm({ nombre: '', email: '', horario_inicio: '07:00', horario_fin: '20:00', role: 'Staff' });
    loadUsers();
  };

  const handleShowHistory = (user) => {
    const logs = dataStore.getUserLogs(user.id);
    setHistoryLogs(logs);
    setShowHistory(user);
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (showEdit) {
      dataStore.updateUser(showEdit.id, {
        horario_inicio: showEdit.horario_inicio,
        horario_fin: showEdit.horario_fin,
        role: showEdit.role,
      });
      setShowEdit(null);
      loadUsers();
    }
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('es-PE', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1><Users style={{ display: 'inline', verticalAlign: 'middle', marginRight: '10px' }} color="var(--accent-cyan)" size={28} />Gestión de Identidades</h1>
        <p>Administración de usuarios, estados, horarios de acceso y enrollment biométrico</p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '300px' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '350px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="input"
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>
          <select className="select" style={{ width: '160px' }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="ACTIVO">Activo</option>
            <option value="BLOQUEADO">Bloqueado</option>
            <option value="SUSPENDIDO">Suspendido</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={() => setShowEnroll(true)}>
          <UserPlus size={18} />
          Nuevo Enrollment
        </button>
      </div>

      {/* Users Table */}
      <div className="glass-panel-static">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Horario</th>
                <th>Accesos</th>
                <th>Último Acceso</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.id}>
                  <td style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>#{u.id}</td>
                  <td style={{ fontWeight: 600 }}>{u.nombre}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{u.email}</td>
                  <td>
                    <span style={{
                      padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem',
                      background: 'rgba(139, 92, 246, 0.12)', color: 'var(--accent-purple)',
                    }}>{u.role}</span>
                  </td>
                  <td><StatusBadge status={u.estado} size="sm" showDot /></td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {u.horario_inicio && u.horario_fin ? `${u.horario_inicio} - ${u.horario_fin}` : '—'}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{u.total_accesos || 0}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(u.ultimo_acceso)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn-icon" title="Historial" onClick={() => handleShowHistory(u)}>
                        <History size={16} />
                      </button>
                      <button className="btn-icon" title="Editar horario" onClick={() => setShowEdit({ ...u })}>
                        <Edit size={16} />
                      </button>
                      <button
                        className="btn-icon"
                        title={u.estado === 'ACTIVO' ? 'Bloquear' : 'Desbloquear'}
                        onClick={() => handleToggleStatus(u.id)}
                        style={{
                          color: u.estado === 'ACTIVO' ? 'var(--status-warning)' : 'var(--status-online)',
                        }}
                      >
                        {u.estado === 'ACTIVO' ? <Lock size={16} /> : <Unlock size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <Users size={32} />
                      <span>No se encontraron usuarios</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '1rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          {filteredUsers.length} de {users.length} usuarios mostrados
        </div>
      </div>

      {/* Enrollment Modal */}
      <Modal isOpen={showEnroll} onClose={() => setShowEnroll(false)} title="Nuevo Enrollment Biométrico" maxWidth="520px">
        <form onSubmit={handleEnroll}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="label">Nombre Completo *</label>
              <input className="input" required placeholder="Ej: María García López"
                value={enrollForm.nombre} onChange={e => setEnrollForm(p => ({ ...p, nombre: e.target.value }))} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="usuario@unmsm.edu.pe"
                value={enrollForm.email} onChange={e => setEnrollForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <label className="label">Rol</label>
              <select className="select" value={enrollForm.role} onChange={e => setEnrollForm(p => ({ ...p, role: e.target.value }))}>
                <option value="Docente">Docente</option>
                <option value="Estudiante">Estudiante</option>
                <option value="Investigador">Investigador</option>
                <option value="Administrativo">Administrativo</option>
                <option value="Contratista">Contratista</option>
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label className="label">Horario Inicio</label>
                <input className="input" type="time" value={enrollForm.horario_inicio}
                  onChange={e => setEnrollForm(p => ({ ...p, horario_inicio: e.target.value }))} />
              </div>
              <div>
                <label className="label">Horario Fin</label>
                <input className="input" type="time" value={enrollForm.horario_fin}
                  onChange={e => setEnrollForm(p => ({ ...p, horario_fin: e.target.value }))} />
              </div>
            </div>
            
            <div style={{ padding: '1rem', background: 'rgba(6, 182, 212, 0.08)', borderRadius: '10px', border: '1px solid rgba(6, 182, 212, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Shield size={16} color="var(--accent-cyan)" />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-cyan)' }}>Captura Biométrica</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                El enrollment completo requiere 3-5 fotografías faciales procesadas por el Motor de IA (POST /api/v1/enroll).
                El registro se crea con datos básicos; las imágenes se envían directamente al nodo ESP32-S3.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowEnroll(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">
                <UserPlus size={16} /> Registrar Usuario
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* History Modal */}
      <Modal isOpen={!!showHistory} onClose={() => setShowHistory(null)} title={`Historial — ${showHistory?.nombre}`} maxWidth="700px">
        {showHistory && (
          <div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 16px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-online)' }}>
                  {historyLogs.filter(l => l.decision === 'GRANT').length}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Accesos</div>
              </div>
              <div style={{ padding: '8px 16px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-offline)' }}>
                  {historyLogs.filter(l => l.decision === 'DENY').length}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Rechazos</div>
              </div>
            </div>
            <div className="table-container" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Nodo</th>
                    <th>Evento</th>
                    <th>Decisión</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {new Date(log.timestamp_utc).toLocaleString('es-PE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>{log.node_id}</td>
                      <td style={{ fontSize: '0.8rem' }}>{log.event_type?.replace(/_/g, ' ')}</td>
                      <td><StatusBadge status={log.decision} size="sm" /></td>
                      <td style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{log.similarity_score?.toFixed(3)}</td>
                    </tr>
                  ))}
                  {historyLogs.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>Sin registros</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Schedule Modal */}
      <Modal isOpen={!!showEdit} onClose={() => setShowEdit(null)} title="Editar Horario de Acceso" maxWidth="450px">
        {showEdit && (
          <form onSubmit={handleSaveEdit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="label">Usuario</label>
                <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{showEdit.nombre}</div>
              </div>
              <div>
                <label className="label">Rol</label>
                <select className="select" value={showEdit.role} onChange={e => setShowEdit(p => ({ ...p, role: e.target.value }))}>
                  <option value="Docente">Docente</option>
                  <option value="Estudiante">Estudiante</option>
                  <option value="Investigador">Investigador</option>
                  <option value="Administrativo">Administrativo</option>
                  <option value="Contratista">Contratista</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="label">Horario Inicio</label>
                  <input className="input" type="time" value={showEdit.horario_inicio || '07:00'}
                    onChange={e => setShowEdit(p => ({ ...p, horario_inicio: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Horario Fin</label>
                  <input className="input" type="time" value={showEdit.horario_fin || '20:00'}
                    onChange={e => setShowEdit(p => ({ ...p, horario_fin: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowEdit(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar Cambios</button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
