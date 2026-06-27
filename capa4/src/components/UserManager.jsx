import React, { useState } from 'react';
import { Users, UserPlus, Lock, Unlock } from 'lucide-react';

export const UserManager = () => {
  const [users] = useState([
    { id: 1, name: 'Alice Smith', email: 'alice@example.com', status: 'ACTIVO', role: 'Staff' },
    { id: 2, name: 'Bob Johnson', email: 'bob@example.com', status: 'BLOQUEADO', role: 'Contractor' },
    { id: 3, name: 'Charlie Davis', email: 'charlie@example.com', status: 'ACTIVO', role: 'Admin' },
  ]);

  return (
    <div className="glass-panel slide-in" style={{ height: '100%' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Users color="var(--accent-cyan)" />
          Gestión de Identidades
        </h2>
        <button style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 20px', background: 'var(--accent-blue)', color: 'white',
          border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'
        }}>
          <UserPlus size={18} />
          Nuevo Enrollment
        </button>
      </header>

      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--panel-border)' }}>
            <th style={{ padding: '15px 10px', color: 'var(--text-secondary)' }}>ID</th>
            <th style={{ padding: '15px 10px', color: 'var(--text-secondary)' }}>Nombre</th>
            <th style={{ padding: '15px 10px', color: 'var(--text-secondary)' }}>Email</th>
            <th style={{ padding: '15px 10px', color: 'var(--text-secondary)' }}>Estado</th>
            <th style={{ padding: '15px 10px', color: 'var(--text-secondary)' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <td style={{ padding: '15px 10px' }}>{u.id}</td>
              <td style={{ padding: '15px 10px', fontWeight: 'bold' }}>{u.name}</td>
              <td style={{ padding: '15px 10px', color: 'var(--text-secondary)' }}>{u.email}</td>
              <td style={{ padding: '15px 10px' }}>
                <span style={{
                  padding: '4px 10px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold',
                  background: u.status === 'ACTIVO' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  color: u.status === 'ACTIVO' ? 'var(--status-online)' : 'var(--status-offline)'
                }}>
                  {u.status}
                </span>
              </td>
              <td style={{ padding: '15px 10px' }}>
                <button style={{
                  background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white',
                  padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                }}>
                  {u.status === 'ACTIVO' ? <Lock size={16} color="var(--status-warning)"/> : <Unlock size={16} color="var(--status-online)"/>}
                  {u.status === 'ACTIVO' ? 'Bloquear' : 'Desbloquear'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
