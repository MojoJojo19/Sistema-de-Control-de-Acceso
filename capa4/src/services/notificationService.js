/**
 * notificationService.js — Sistema de Notificaciones Browser
 * 
 * Maneja notificaciones push del navegador y sonido de alertas.
 * Según specs_capa4.md §6 — SLA < 2s para CRITICO/ALTO.
 */

class NotificationService {
  constructor() {
    this.permission = 'default';
    this.enabled = true;
    this.soundEnabled = true;
    this._audioCtx = null;
  }

  async init() {
    if ('Notification' in window) {
      this.permission = Notification.permission;
      if (this.permission === 'default') {
        this.permission = await Notification.requestPermission();
      }
    }
  }

  _getAudioContext() {
    if (!this._audioCtx) {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this._audioCtx;
  }

  _playAlertSound(severity) {
    if (!this.soundEnabled) return;

    try {
      const ctx = this._getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (severity === 'CRITICO') {
        // Alarma urgente: frecuencia alta, rápida
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
        oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.5);
      } else if (severity === 'ALTO') {
        // Alerta importante: tono medio
        oscillator.frequency.setValueAtTime(660, ctx.currentTime);
        oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.4);
      } else {
        // Notificación suave
        oscillator.frequency.setValueAtTime(520, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {
      console.warn('No se pudo reproducir sonido de alerta:', e);
    }
  }

  notify(title, body, severity = 'INFO', options = {}) {
    if (!this.enabled) return;

    // Sonido para CRITICO y ALTO
    if (severity === 'CRITICO' || severity === 'ALTO') {
      this._playAlertSound(severity);
    }

    // Browser notification
    if (this.permission === 'granted') {
      try {
        const icon = severity === 'CRITICO' ? '🚨' : severity === 'ALTO' ? '⚠️' : 'ℹ️';
        const notification = new Notification(`${icon} ${title}`, {
          body,
          tag: options.tag || `alert-${Date.now()}`,
          requireInteraction: severity === 'CRITICO',
          silent: true, // Usamos nuestro propio sonido
        });

        // Auto-cerrar después de 8s para no-críticos
        if (severity !== 'CRITICO') {
          setTimeout(() => notification.close(), 8000);
        }

        if (options.onClick) {
          notification.onclick = options.onClick;
        }
      } catch (e) {
        console.warn('Error creando notificación:', e);
      }
    }
  }

  notifyAccess(event) {
    const { event_type, severity, node_id, user_id } = event;
    
    const titles = {
      'SPOOFING_ATTEMPT': '🚨 INTENTO DE SPOOFING',
      'BRUTE_FORCE_DETECTED': '🚨 FUERZA BRUTA DETECTADA',
      'IDENTITY_MISMATCH': '⚠️ Identidad No Coincide',
      'ACCESS_OUT_OF_SCHEDULE': '⚠️ Acceso Fuera de Horario',
      'NO_FACE_DETECTED': '⚠️ Sin Rostro Detectado',
      'LOW_QUALITY_FRAME': 'Frame de Baja Calidad',
      'USER_INACTIVE': 'Usuario Inactivo',
    };

    const title = titles[event_type] || event_type;
    const body = `Nodo: ${node_id}${user_id ? ` | Usuario: #${user_id}` : ''}`;

    this.notify(title, body, severity);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = enabled;
  }
}

export const notificationService = new NotificationService();
