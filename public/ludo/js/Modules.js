// ============================================================
// EventBus.js — Lightweight pub/sub (identical to checkers' copy)
// ============================================================
'use strict';

export class EventBus {
  constructor() { this._listeners = {}; }
  on(event, fn)  { (this._listeners[event] = this._listeners[event] || []).push(fn); return this; }
  off(event, fn) { if (this._listeners[event]) this._listeners[event] = this._listeners[event].filter(f => f !== fn); }
  emit(event, data) { (this._listeners[event] || []).forEach(fn => fn(data)); }
  once(event, fn) {
    const wrap = d => { fn(d); this.off(event, wrap); };
    this.on(event, wrap);
  }
}

// ============================================================
// PlayerProfile.js — Per-player stats (localStorage)
// ============================================================
export class PlayerProfile {
  constructor(id, displayName) {
    this.id          = id;
    this.displayName = displayName;
    this.wins        = 0;
    this.losses      = 0;
    this.draws       = 0;
    this._load();
  }

  get winRate() {
    const total = this.wins + this.losses + this.draws;
    return total ? Math.round((this.wins / total) * 100) : 0;
  }

  save() {
    try {
      localStorage.setItem(`ludo_player_${this.id}`, JSON.stringify({
        wins: this.wins, losses: this.losses, draws: this.draws,
        displayName: this.displayName,
      }));
    } catch (_) {}
  }

  _load() {
    try {
      const raw = localStorage.getItem(`ludo_player_${this.id}`);
      if (!raw) return;
      Object.assign(this, JSON.parse(raw));
    } catch (_) {}
  }
}

// ============================================================
// TrialManager.js — Daily free-match quota (max 3)
// ============================================================
// NOTE: the quota is namespaced per signed-in user id (set via setUser()
// before any other call, from the ?userId= query param in index.html).
// Previously this used one global localStorage key shared by every account
// that ever opened practice mode on a device/browser — so a brand-new user
// who registered on a device that had already burned its 3 daily matches
// (e.g. during testing, or under a different account) would immediately
// see 0 remaining. Keying by user id gives each account its own
// independent daily quota. Falls back to a shared 'guest' bucket only if
// no userId was supplied at all.
export class TrialManager {
  static MAX_FREE = 3;
  static _uid = null;

  /** Call once at boot with the signed-in user's id (or null/undefined for guest). */
  static setUser(userId) {
    TrialManager._uid = userId || null;
  }

  static _key() {
    return `ludo_trial_data_${TrialManager._uid || 'guest'}`;
  }

  static canPlay() {
    const today = new Date().toDateString();
    try {
      const raw  = localStorage.getItem(TrialManager._key());
      const data = raw ? JSON.parse(raw) : {};
      if (data.date !== today) return true;
      return (data.count || 0) < TrialManager.MAX_FREE;
    } catch (_) { return true; }
  }

  static remaining() {
    const today = new Date().toDateString();
    try {
      const raw  = localStorage.getItem(TrialManager._key());
      const data = raw ? JSON.parse(raw) : {};
      if (data.date !== today) return TrialManager.MAX_FREE;
      return Math.max(0, TrialManager.MAX_FREE - (data.count || 0));
    } catch (_) { return TrialManager.MAX_FREE; }
  }

  static recordMatch() {
    const today = new Date().toDateString();
    try {
      const raw   = localStorage.getItem(TrialManager._key());
      const data  = raw ? JSON.parse(raw) : {};
      const count = (data.date === today ? data.count || 0 : 0) + 1;
      localStorage.setItem(TrialManager._key(), JSON.stringify({ date: today, count }));
    } catch (_) {}
  }
}

// ============================================================
// ThemeManager.js — Visual preset controller
// ============================================================
// Color slots use the same numeric-hex convention as checkers' Modules.js
// (Three.js style 0xRRGGBB) except for the CSS-string fields (boardBg,
// fogColor), so Renderer2D.js can reuse the exact same numToHex()/lighten()
// helpers unchanged.
export const THEMES = {
  classic: {
    name: 'Classic Board',
    boardBg:    '#1b1b1b',
    frameColor: 0x4a3320,
    cellLight:  0xF5F0E1,
    cellDark:   0xE3DAC2,
    centerBg:   0x2d2d2d,
    red:    0xE53935, redDark:    0xB71C1C,
    green:  0x43A047, greenDark:  0x1B5E20,
    yellow: 0xFBC02D, yellowDark: 0xF57F17,
    blue:   0x1E88E5, blueDark:   0x0D47A1,
    diceface: 0xFFFFFF, diceDot: 0x222222,
    starColor: 0xFFD700,
  },
  royal: {
    name: 'Royal Purple',
    boardBg:    '#120a1e',
    frameColor: 0x3a1d5c,
    cellLight:  0xEDE3FF,
    cellDark:   0xC9AEF0,
    centerBg:   0x1d0f33,
    red:    0xE53977, redDark:    0xA0285A,
    green:  0x3FB68B, greenDark:  0x1F7A5C,
    yellow: 0xF2C14E, yellowDark: 0xC79A2E,
    blue:   0x7C4DFF, blueDark:   0x4A2FB0,
    diceface: 0xFFFFFF, diceDot: 0x2a0f4a,
    starColor: 0xFFD700,
  },
  sunset: {
    name: 'Sunset Sands',
    boardBg:    '#2b140a',
    frameColor: 0x7a3a12,
    cellLight:  0xFFE8C9,
    cellDark:   0xFFC98A,
    centerBg:   0x3a1c0c,
    red:    0xD7263D, redDark:    0x8E1729,
    green:  0x4F9D69, greenDark:  0x2E6B40,
    yellow: 0xFFB400, yellowDark: 0xCC8F00,
    blue:   0x2A6F97, blueDark:   0x184A65,
    diceface: 0xFFF6E8, diceDot: 0x3a1c0c,
    starColor: 0xFFE680,
  },
  ocean: {
    name: 'Ocean Depths',
    boardBg:    '#04141c',
    frameColor: 0x0c3a4a,
    cellLight:  0xDFF6FF,
    cellDark:   0xA9E2F3,
    centerBg:   0x062430,
    red:    0xEF5350, redDark:    0xB23330,
    green:  0x26A69A, greenDark:  0x12685F,
    yellow: 0xFFD54F, yellowDark: 0xCBA535,
    blue:   0x29B6F6, blueDark:   0x1473A3,
    diceface: 0xFFFFFF, diceDot: 0x04141c,
    starColor: 0xFFE082,
  },
};

export class ThemeManager {
  constructor(initialTheme = 'classic') {
    this._current = initialTheme;
    this._listeners = [];
  }

  get current() { return { id: this._current, ...THEMES[this._current] }; }

  apply(themeId) {
    if (!THEMES[themeId]) return;
    this._current = themeId;
    this._listeners.forEach(fn => fn(this.current));
  }

  onChange(fn) { this._listeners.push(fn); }

  list() { return Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name })); }
}
