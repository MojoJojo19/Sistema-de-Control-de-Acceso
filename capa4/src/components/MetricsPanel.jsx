import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Clock, Shield, Wifi, AlertTriangle } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart,
} from 'recharts';
import { dataStore } from '../services/dataStore';

/**
 * MetricsPanel — Módulo 4: Análisis de Métricas
 * 
 * specs_capa4.md §1 Módulo 4:
 * - FAR y FRR por período
 * - Latencia del sistema (promedio y P95, objetivo < 500ms)
 * - Tasa de accesos GRANT vs DENY por nodo, usuario, franja horaria
 * - Intentos sospechosos: SPOOFING, BRUTE_FORCE, IDENTITY_MISMATCH
 * - Disponibilidad de nodos (uptime)
 * - Reportes periódicos
 */

const COLORS = {
  cyan: '#06b6d4',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  green: '#10b981',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#f59e0b',
  pink: '#ec4899',
};

const PIE_COLORS = [COLORS.green, COLORS.red, COLORS.orange, COLORS.yellow, COLORS.cyan];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(30, 41, 59, 0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '8px',
      padding: '10px 14px',
      boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
    }}>
      <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>{label}</div>
      {payload.map((entry, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', marginBottom: '2px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: entry.color }} />
          <span style={{ color: '#94a3b8' }}>{entry.name}:</span>
          <span style={{ fontWeight: 600, color: '#f8fafc' }}>
            {typeof entry.value === 'number' ? entry.value.toFixed(entry.name?.includes('ms') || entry.name?.includes('Latencia') ? 0 : 0) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export const MetricsPanel = () => {
  const [metrics, setMetrics] = useState(null);
  const [period, setPeriod] = useState('24h');

  useEffect(() => {
    setMetrics(dataStore.getMetrics());
  }, []);

  const refreshMetrics = () => {
    setMetrics(dataStore.refreshMetrics());
  };

  if (!metrics) return null;

  const hourlyData = metrics.hourly || [];

  // Datos para pie chart de accesos
  const accessPieData = [
    { name: 'GRANT', value: metrics.total_grants_today },
    { name: 'DENY', value: metrics.total_denies_today },
  ];

  // Datos de uptime de nodos
  const uptimeData = Object.entries(metrics.node_uptime || {}).map(([id, pct]) => ({
    name: id.replace('ESP32-S3-', ''),
    uptime: pct,
    downtime: 100 - pct,
  }));

  // Datos de intentos sospechosos
  const suspiciousData = hourlyData.map(h => ({
    hour: h.hour,
    spoofing: h.spoofing_attempts,
    brute_force: h.brute_force,
    identity_mismatch: h.identity_mismatch,
  }));

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1><BarChart3 style={{ display: 'inline', verticalAlign: 'middle', marginRight: '10px' }} color="var(--accent-cyan)" size={28} />Análisis de Métricas</h1>
        <p>Métricas biométricas, rendimiento del pipeline y reportes del sistema</p>
      </div>

      {/* Period Selector + Summary */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div className="tabs">
          {['24h', '7d', '30d'].map(p => (
            <button key={p} className={`tab ${period === p ? 'active' : ''}`} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {/* Summary KPIs */}
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', padding: '8px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: '10px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: COLORS.green }}>{(metrics.far * 100).toFixed(2)}%</div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>FAR</div>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: COLORS.cyan }}>{(metrics.frr * 100).toFixed(2)}%</div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>FRR</div>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: metrics.latency_avg_ms < 500 ? COLORS.green : COLORS.red }}>{metrics.latency_avg_ms} ms</div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Latencia Avg</div>
            </div>
            <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: metrics.latency_p95_ms < 500 ? COLORS.cyan : COLORS.orange }}>{metrics.latency_p95_ms} ms</div>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>P95</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={refreshMetrics}>Actualizar</button>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="metrics-grid">
        {/* 1. Tasa de Accesos por Hora */}
        <div className="glass-panel-static chart-card">
          <h3><TrendingUp size={18} color={COLORS.cyan} /> Tasa de Accesos por Hora</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={hourlyData}>
              <defs>
                <linearGradient id="gradGrant" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.green} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.green} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradDeny" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.red} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.red} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Area type="monotone" dataKey="grants" name="GRANT" stroke={COLORS.green} fill="url(#gradGrant)" strokeWidth={2} />
              <Area type="monotone" dataKey="denies" name="DENY" stroke={COLORS.red} fill="url(#gradDeny)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 2. Latencia del Pipeline */}
        <div className="glass-panel-static chart-card">
          <h3><Clock size={18} color={COLORS.blue} /> Latencia del Pipeline (ms)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 600]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {/* SLA Line */}
              <Line type="monotone" dataKey={() => 500} name="SLA (500ms)" stroke={COLORS.red} strokeDasharray="8 4" strokeWidth={1} dot={false} />
              <Line type="monotone" dataKey="latency_avg" name="Promedio" stroke={COLORS.cyan} strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="latency_p95" name="P95" stroke={COLORS.purple} strokeWidth={2} dot={{ r: 2 }} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 3. Intentos Sospechosos */}
        <div className="glass-panel-static chart-card">
          <h3><AlertTriangle size={18} color={COLORS.orange} /> Intentos Sospechosos</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={suspiciousData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94a3b8' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="spoofing" name="Spoofing" fill={COLORS.red} radius={[4, 4, 0, 0]} />
              <Bar dataKey="brute_force" name="Brute Force" fill={COLORS.orange} radius={[4, 4, 0, 0]} />
              <Bar dataKey="identity_mismatch" name="ID Mismatch" fill={COLORS.yellow} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* 4. Distribución de Decisiones */}
        <div className="glass-panel-static chart-card">
          <h3><Shield size={18} color={COLORS.purple} /> Distribución de Decisiones Hoy</h3>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2rem' }}>
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie
                  data={accessPieData} cx="50%" cy="50%"
                  innerRadius={55} outerRadius={80}
                  paddingAngle={5} dataKey="value"
                >
                  {accessPieData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS.green }} />
                <span style={{ fontSize: '0.85rem' }}>GRANT: <strong>{metrics.total_grants_today}</strong></span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: COLORS.red }} />
                <span style={{ fontSize: '0.85rem' }}>DENY: <strong>{metrics.total_denies_today}</strong></span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '8px' }}>
                Tasa de éxito: <strong style={{ color: COLORS.green }}>
                  {metrics.total_grants_today + metrics.total_denies_today > 0
                    ? ((metrics.total_grants_today / (metrics.total_grants_today + metrics.total_denies_today)) * 100).toFixed(1)
                    : 0}%
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Disponibilidad de Nodos */}
        <div className="glass-panel-static chart-card" style={{ gridColumn: '1 / -1' }}>
          <h3><Wifi size={18} color={COLORS.green} /> Disponibilidad de Nodos (Uptime %)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={uptimeData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#f8fafc' }} width={120} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="uptime" name="Uptime %" fill={COLORS.green} radius={[0, 6, 6, 0]} barSize={20}>
                {uptimeData.map((entry, index) => (
                  <Cell key={index} fill={entry.uptime >= 99 ? COLORS.green : entry.uptime >= 95 ? COLORS.yellow : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
