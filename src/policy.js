'use strict';
const defaults = { sleepMinutes: 5, bookmarkBar: true, theme: 'dark', themeVersion: 2, exceptions: [] };
function isWebUrl(value) { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !!u.hostname; } catch { return false; } }
function addressToUrl(value) {
  const s = String(value || '').trim(); if (!s) return '';
  if (/^https?:\/\//i.test(s) && isWebUrl(s)) return new URL(s).href;
  if (!/\s/.test(s) && !/^[a-z][a-z\d+.-]*:/i.test(s.replace(/^(localhost|[\w.-]+):\d+/, '$1')) && (s.includes('.') || /^localhost(:\d+)?(\/|$)/i.test(s))) {
    const u = (/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(s) ? 'http://' : 'https://') + s;
    if (isWebUrl(u)) return new URL(u).href;
  }
  return 'https://www.google.com/search?q=' + encodeURIComponent(s) + '&hl=nl&gl=be';
}
function host(value) { try { return new URL(value).hostname; } catch { return ''; } }
function normalizeSettings(value = {}) {
  return { sleepMinutes: [0,2,5,15].includes(value.sleepMinutes) ? value.sleepMinutes : 5, bookmarkBar: value.bookmarkBar !== false,
    theme: ['light','dark','system'].includes(value.theme) ? value.theme : 'dark', themeVersion: 2,
    exceptions: Array.isArray(value.exceptions) ? [...new Set(value.exceptions.filter(x => typeof x === 'string' && /^[a-z0-9.-]+$/i.test(x)).map(x => x.toLowerCase()))].slice(0,200) : [] };
}
function sleepReason(t, settings = defaults, now = Date.now(), manual = false) {
  if (t.kind !== 'web') return 'Interne pagina';
  if (!t.hasView) return 'In slaapstand';
  if (t.active) return 'Actief tabblad';
  if (t.pinned) return 'Vastgezet';
  if (t.excepted) return 'Altijd actief';
  if (t.dirty) return 'Onopgeslagen invoer';
  if (t.media || t.audible || now - (t.recentAudio || 0) < 60000) return 'Media actief';
  if (t.downloading) return 'Download actief';
  if (t.loading) return 'Pagina wordt geladen';
  if (t.unloadBlocked) return 'Pagina wil actief blijven';
  if (t.frameCount > 1) return 'Ingesloten inhoud';
  if (!manual && !settings.sleepMinutes) return 'Besparing uit';
  if (!manual && now - t.lastActive < settings.sleepMinutes * 60000) return 'Recent gebruikt';
  return '';
}
module.exports = { defaults, normalizeSettings, addressToUrl, isWebUrl, host, sleepReason };
