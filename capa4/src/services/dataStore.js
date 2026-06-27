/**
 * dataStore.js — Store Centralizado de Datos
 * 
 * Proporciona datos simulados realistas para la Capa 4.
 * Usa localStorage para persistencia entre recargas.
 * Actúa como fallback cuando la API de Capa 3 no está disponible.
 */

const STORAGE_KEYS = {
  USERS: 'capa4_users',
  NODES: 'capa4_nodes',
  LOGS: 'capa4_logs',
  ALERTS: 'capa4_alerts',
  METRICS: 'capa4_metrics',
};

// ============================================================================
// Datos Iniciales Realistas
// ============================================================================

const INITIAL_USERS = [
  {
    id: 1, nombre: 'Alice Rodríguez', email: 'alice.rodriguez@unmsm.edu.pe',
    estado: 'ACTIVO', role: 'Docente', horario_inicio: '07:00', horario_fin: '20:00',
    fecha_registro: '2026-03-15T08:00:00Z', total_accesos: 142, ultimo_acceso: '2026-06-27T14:32:00Z',
  },
  {
    id: 2, nombre: 'Bob Fernández', email: 'bob.fernandez@unmsm.edu.pe',
    estado: 'ACTIVO', role: 'Investigador', horario_inicio: '06:00', horario_fin: '22:00',
    fecha_registro: '2026-04-02T10:30:00Z', total_accesos: 98, ultimo_acceso: '2026-06-27T13:15:00Z',
  },
  {
    id: 3, nombre: 'Charlie Mendoza', email: 'charlie.mendoza@unmsm.edu.pe',
    estado: 'BLOQUEADO', role: 'Estudiante', horario_inicio: '08:00', horario_fin: '18:00',
    fecha_registro: '2026-04-20T09:00:00Z', total_accesos: 55, ultimo_acceso: '2026-06-25T16:45:00Z',
  },
  {
    id: 4, nombre: 'Diana Torres', email: 'diana.torres@unmsm.edu.pe',
    estado: 'ACTIVO', role: 'Administrativo', horario_inicio: '08:00', horario_fin: '17:00',
    fecha_registro: '2026-02-10T07:30:00Z', total_accesos: 210, ultimo_acceso: '2026-06-27T15:01:00Z',
  },
  {
    id: 5, nombre: 'Eduardo Quispe', email: 'eduardo.quispe@unmsm.edu.pe',
    estado: 'SUSPENDIDO', role: 'Contratista', horario_inicio: '09:00', horario_fin: '15:00',
    fecha_registro: '2026-05-01T11:00:00Z', total_accesos: 23, ultimo_acceso: '2026-06-20T14:20:00Z',
  },
  {
    id: 6, nombre: 'Fernanda Vargas', email: 'fernanda.vargas@unmsm.edu.pe',
    estado: 'ACTIVO', role: 'Docente', horario_inicio: '07:00', horario_fin: '21:00',
    fecha_registro: '2026-01-20T08:00:00Z', total_accesos: 305, ultimo_acceso: '2026-06-27T14:58:00Z',
  },
];

const INITIAL_NODES = [
  {
    id: 'ESP32-S3-PUERTA-01', nombre: 'Puerta Principal - Facultad FISI',
    ubicacion: 'Edificio A, Piso 1, Entrada Principal', estado: 'ONLINE',
    ultimo_heartbeat: new Date().toISOString(), timeout_count: 0,
    fecha_registro: '2026-01-15T10:00:00Z', uptime_percent: 99.7,
    blocked_until: null, block_reason: null,
  },
  {
    id: 'ESP32-S3-PUERTA-02', nombre: 'Laboratorio de Cómputo',
    ubicacion: 'Edificio B, Piso 2, Lab 201', estado: 'ONLINE',
    ultimo_heartbeat: new Date().toISOString(), timeout_count: 0,
    fecha_registro: '2026-02-01T09:00:00Z', uptime_percent: 98.5,
    blocked_until: null, block_reason: null,
  },
  {
    id: 'ESP32-S3-PUERTA-03', nombre: 'Sala de Servidores',
    ubicacion: 'Edificio A, Sótano, Sala S-1', estado: 'DEGRADADO',
    ultimo_heartbeat: new Date(Date.now() - 45000).toISOString(), timeout_count: 1,
    fecha_registro: '2026-03-10T14:00:00Z', uptime_percent: 95.2,
    blocked_until: null, block_reason: null,
  },
  {
    id: 'ESP32-S3-PUERTA-04', nombre: 'Oficina del Decano',
    ubicacion: 'Edificio A, Piso 3, Oficina 301', estado: 'OFFLINE',
    ultimo_heartbeat: new Date(Date.now() - 180000).toISOString(), timeout_count: 3,
    fecha_registro: '2026-04-05T11:00:00Z', uptime_percent: 88.1,
    blocked_until: null, block_reason: null,
  },
];

const EVENT_TYPES = [
  'SUCCESSFUL_ACCESS', 'IDENTITY_MISMATCH', 'SPOOFING_ATTEMPT',
  'BRUTE_FORCE_DETECTED', 'ACCESS_OUT_OF_SCHEDULE', 'LOW_QUALITY_FRAME',
  'USER_INACTIVE', 'RATE_LIMIT_EXCEEDED', 'NO_FACE_DETECTED',
];

const SEVERITY_MAP = {
  'SPOOFING_ATTEMPT': 'CRITICO',
  'BRUTE_FORCE_DETECTED': 'CRITICO',
  'IDENTITY_MISMATCH': 'ALTO',
  'ACCESS_OUT_OF_SCHEDULE': 'ALTO',
  'NO_FACE_DETECTED': 'ALTO',
  'LOW_QUALITY_FRAME': 'MEDIO',
  'USER_INACTIVE': 'MEDIO',
  'RATE_LIMIT_EXCEEDED': 'BAJO',
  'SUCCESSFUL_ACCESS': 'INFO',
};

function generateLogs() {
  const logs = [];
  const now = Date.now();
  const nodeIds = INITIAL_NODES.map(n => n.id);
  const userIds = INITIAL_USERS.map(u => u.id);

  for (let i = 0; i < 50; i++) {
    const timestamp = new Date(now - Math.random() * 7 * 24 * 3600000);
    const isGrant = Math.random() > 0.25;
    const eventType = isGrant ? 'SUCCESSFUL_ACCESS' : EVENT_TYPES[Math.floor(Math.random() * (EVENT_TYPES.length - 1)) + 1];
    const severity = SEVERITY_MAP[eventType] || 'INFO';
    const decision = isGrant ? 'GRANT' : 'DENY';

    logs.push({
      id: i + 1,
      timestamp_utc: timestamp.toISOString(),
      node_id: nodeIds[Math.floor(Math.random() * nodeIds.length)],
      user_id: isGrant || Math.random() > 0.3 ? userIds[Math.floor(Math.random() * userIds.length)] : null,
      event_type: eventType,
      severity,
      decision,
      similarity_score: isGrant ? 0.85 + Math.random() * 0.14 : Math.random() * 0.82,
      liveness_score: eventType === 'SPOOFING_ATTEMPT' ? 0.3 + Math.random() * 0.55 : 0.86 + Math.random() * 0.13,
      sync_mode: Math.random() > 0.9 ? 1 : 0,
      has_evidence: eventType === 'SPOOFING_ATTEMPT',
      pipeline_ms: 120 + Math.random() * 280,
    });
  }

  return logs.sort((a, b) => new Date(b.timestamp_utc) - new Date(a.timestamp_utc));
}

function generateAlerts(logs) {
  return logs
    .filter(l => l.severity === 'CRITICO' || l.severity === 'ALTO')
    .map((l, i) => ({
      id: i + 1,
      log_id: l.id,
      timestamp: l.timestamp_utc,
      event_type: l.event_type,
      severity: l.severity,
      node_id: l.node_id,
      user_id: l.user_id,
      resolved: Math.random() > 0.4,
      resolved_at: Math.random() > 0.4 ? new Date(new Date(l.timestamp_utc).getTime() + 300000).toISOString() : null,
      resolved_by: Math.random() > 0.4 ? 'Admin' : null,
    }));
}

function generateMetrics() {
  const hours = [];
  for (let i = 23; i >= 0; i--) {
    const t = new Date(Date.now() - i * 3600000);
    hours.push({
      hour: t.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
      timestamp: t.toISOString(),
      grants: Math.floor(5 + Math.random() * 15),
      denies: Math.floor(Math.random() * 5),
      latency_avg: 120 + Math.random() * 200,
      latency_p95: 250 + Math.random() * 200,
      spoofing_attempts: Math.random() > 0.85 ? Math.floor(1 + Math.random() * 3) : 0,
      brute_force: Math.random() > 0.92 ? 1 : 0,
      identity_mismatch: Math.floor(Math.random() * 3),
    });
  }
  return {
    far: 0.0018,
    frr: 0.0042,
    latency_avg_ms: 184,
    latency_p95_ms: 347,
    total_grants_today: hours.reduce((s, h) => s + h.grants, 0),
    total_denies_today: hours.reduce((s, h) => s + h.denies, 0),
    hourly: hours,
    node_uptime: {
      'ESP32-S3-PUERTA-01': 99.7,
      'ESP32-S3-PUERTA-02': 98.5,
      'ESP32-S3-PUERTA-03': 95.2,
      'ESP32-S3-PUERTA-04': 88.1,
    },
  };
}

// ============================================================================
// Data Store Class
// ============================================================================

class DataStore {
  constructor() {
    this._listeners = {};
    this._init();
  }

  _init() {
    // Cargar o generar datos
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      this._save(STORAGE_KEYS.USERS, INITIAL_USERS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.NODES)) {
      this._save(STORAGE_KEYS.NODES, INITIAL_NODES);
    }
    if (!localStorage.getItem(STORAGE_KEYS.LOGS)) {
      const logs = generateLogs();
      this._save(STORAGE_KEYS.LOGS, logs);
      this._save(STORAGE_KEYS.ALERTS, generateAlerts(logs));
    }
    if (!localStorage.getItem(STORAGE_KEYS.METRICS)) {
      this._save(STORAGE_KEYS.METRICS, generateMetrics());
    }
  }

  _save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  _load(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch {
      return [];
    }
  }

  // Event emitter
  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
    return () => {
      this._listeners[event] = this._listeners[event].filter(c => c !== cb);
    };
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(cb => cb(data));
  }

  // ========== USUARIOS ==========
  getUsers() { return this._load(STORAGE_KEYS.USERS); }

  getUser(id) { return this.getUsers().find(u => u.id === id); }

  addUser(user) {
    const users = this.getUsers();
    const newUser = {
      ...user,
      id: Math.max(0, ...users.map(u => u.id)) + 1,
      estado: 'ACTIVO',
      fecha_registro: new Date().toISOString(),
      total_accesos: 0,
      ultimo_acceso: null,
    };
    users.push(newUser);
    this._save(STORAGE_KEYS.USERS, users);
    this._emit('users_updated', users);
    return newUser;
  }

  updateUser(id, updates) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    users[idx] = { ...users[idx], ...updates };
    this._save(STORAGE_KEYS.USERS, users);
    this._emit('users_updated', users);
    return users[idx];
  }

  toggleUserStatus(id) {
    const user = this.getUser(id);
    if (!user) return null;
    const nextState = {
      'ACTIVO': 'BLOQUEADO',
      'BLOQUEADO': 'ACTIVO',
      'SUSPENDIDO': 'ACTIVO',
    };
    return this.updateUser(id, { estado: nextState[user.estado] || 'ACTIVO' });
  }

  // ========== NODOS ==========
  getNodes() { return this._load(STORAGE_KEYS.NODES); }

  getNode(id) { return this.getNodes().find(n => n.id === id); }

  addNode(node) {
    const nodes = this.getNodes();
    const newNode = {
      ...node,
      estado: 'ONLINE',
      ultimo_heartbeat: new Date().toISOString(),
      timeout_count: 0,
      fecha_registro: new Date().toISOString(),
      uptime_percent: 100,
      blocked_until: null,
      block_reason: null,
    };
    nodes.push(newNode);
    this._save(STORAGE_KEYS.NODES, nodes);
    this._emit('nodes_updated', nodes);
    return newNode;
  }

  updateNode(id, updates) {
    const nodes = this.getNodes();
    const idx = nodes.findIndex(n => n.id === id);
    if (idx === -1) return null;
    nodes[idx] = { ...nodes[idx], ...updates };
    this._save(STORAGE_KEYS.NODES, nodes);
    this._emit('nodes_updated', nodes);
    return nodes[idx];
  }

  updateNodeHeartbeat(nodeId) {
    return this.updateNode(nodeId, {
      estado: 'ONLINE',
      ultimo_heartbeat: new Date().toISOString(),
      timeout_count: 0,
    });
  }

  unlockNode(nodeId) {
    return this.updateNode(nodeId, {
      blocked_until: null,
      block_reason: null,
    });
  }

  // ========== LOGS ==========
  getLogs(filters = {}) {
    let logs = this._load(STORAGE_KEYS.LOGS);
    
    if (filters.event_type) {
      logs = logs.filter(l => l.event_type === filters.event_type);
    }
    if (filters.severity) {
      logs = logs.filter(l => l.severity === filters.severity);
    }
    if (filters.node_id) {
      logs = logs.filter(l => l.node_id === filters.node_id);
    }
    if (filters.user_id) {
      logs = logs.filter(l => l.user_id === filters.user_id);
    }
    if (filters.decision) {
      logs = logs.filter(l => l.decision === filters.decision);
    }
    if (filters.from) {
      logs = logs.filter(l => new Date(l.timestamp_utc) >= new Date(filters.from));
    }
    if (filters.to) {
      logs = logs.filter(l => new Date(l.timestamp_utc) <= new Date(filters.to));
    }
    if (filters.sync_mode !== undefined) {
      logs = logs.filter(l => l.sync_mode === filters.sync_mode);
    }
    
    return logs;
  }

  addLog(log) {
    const logs = this._load(STORAGE_KEYS.LOGS);
    const newLog = {
      ...log,
      id: Math.max(0, ...logs.map(l => l.id)) + 1,
      timestamp_utc: new Date().toISOString(),
    };
    logs.unshift(newLog);
    this._save(STORAGE_KEYS.LOGS, logs);
    this._emit('logs_updated', logs);
    return newLog;
  }

  getUserLogs(userId) {
    return this.getLogs({ user_id: userId });
  }

  // ========== ALERTAS ==========
  getAlerts(unresolvedOnly = false) {
    const alerts = this._load(STORAGE_KEYS.ALERTS);
    return unresolvedOnly ? alerts.filter(a => !a.resolved) : alerts;
  }

  addAlert(alert) {
    const alerts = this._load(STORAGE_KEYS.ALERTS);
    const newAlert = {
      ...alert,
      id: Math.max(0, ...alerts.map(a => a.id)) + 1,
      timestamp: new Date().toISOString(),
      resolved: false,
      resolved_at: null,
      resolved_by: null,
    };
    alerts.unshift(newAlert);
    this._save(STORAGE_KEYS.ALERTS, alerts);
    this._emit('alerts_updated', alerts);
    return newAlert;
  }

  resolveAlert(id) {
    const alerts = this._load(STORAGE_KEYS.ALERTS);
    const idx = alerts.findIndex(a => a.id === id);
    if (idx === -1) return null;
    alerts[idx] = {
      ...alerts[idx],
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: 'Admin',
    };
    this._save(STORAGE_KEYS.ALERTS, alerts);
    this._emit('alerts_updated', alerts);
    return alerts[idx];
  }

  // ========== MÉTRICAS ==========
  getMetrics() {
    const data = localStorage.getItem(STORAGE_KEYS.METRICS);
    return data ? JSON.parse(data) : generateMetrics();
  }

  refreshMetrics() {
    const metrics = generateMetrics();
    this._save(STORAGE_KEYS.METRICS, metrics);
    this._emit('metrics_updated', metrics);
    return metrics;
  }

  // ========== DISCONNECT HISTORY ==========
  getDisconnectHistory(nodeId) {
    const logs = this._load(STORAGE_KEYS.LOGS);
    return logs.filter(l =>
      l.node_id === nodeId &&
      (l.event_type === 'NODE_OFFLINE' || l.event_type === 'NODE_RECONNECTED' || l.sync_mode === 1)
    );
  }

  // ========== UTILS ==========
  resetAll() {
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    this._init();
    this._emit('reset');
  }

  getUserName(userId) {
    const user = this.getUser(userId);
    return user ? user.nombre : `Usuario #${userId}`;
  }

  getNodeName(nodeId) {
    const node = this.getNode(nodeId);
    return node ? node.nombre : nodeId;
  }
}

export const dataStore = new DataStore();
export { SEVERITY_MAP, EVENT_TYPES };
