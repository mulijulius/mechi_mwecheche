// ============================================================
// EventBus.js — Lightweight pub/sub
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
    this.favoriteVariant = 'english';
    this._load();
  }

  get winRate() {
    const total = this.wins + this.losses + this.draws;
    return total ? Math.round((this.wins / total) * 100) : 0;
  }

  save() {
    try {
      localStorage.setItem(`player_${this.id}`, JSON.stringify({
        wins: this.wins, losses: this.losses, draws: this.draws,
        favoriteVariant: this.favoriteVariant, displayName: this.displayName
      }));
    } catch(_) {}
  }

  _load() {
    try {
      const raw = localStorage.getItem(`player_${this.id}`);
      if (!raw) return;
      const d = JSON.parse(raw);
      Object.assign(this, d);
    } catch(_) {}
  }
}

// ============================================================
// TrialManager.js — Daily free-match quota (max 3)
// ============================================================
export class TrialManager {
  static MAX_FREE = 3;

  static canPlay() {
    const today = new Date().toDateString();
    try {
      const raw  = localStorage.getItem('trial_data');
      const data = raw ? JSON.parse(raw) : {};
      if (data.date !== today) return true;
      return (data.count || 0) < TrialManager.MAX_FREE;
    } catch(_) { return true; }
  }

  static remaining() {
    const today = new Date().toDateString();
    try {
      const raw  = localStorage.getItem('trial_data');
      const data = raw ? JSON.parse(raw) : {};
      if (data.date !== today) return TrialManager.MAX_FREE;
      return Math.max(0, TrialManager.MAX_FREE - (data.count || 0));
    } catch(_) { return TrialManager.MAX_FREE; }
  }

  static recordMatch() {
    const today = new Date().toDateString();
    try {
      const raw  = localStorage.getItem('trial_data');
      const data = raw ? JSON.parse(raw) : {};
      const count = (data.date === today ? data.count || 0 : 0) + 1;
      localStorage.setItem('trial_data', JSON.stringify({ date: today, count }));
    } catch(_) {}
  }
}

// ============================================================
// ThemeManager.js — Visual preset controller
// ============================================================
export const THEMES = {
  classic: {
    name: 'Classic Wood',
    lightTile:  0xDEB887,  darkTile:  0x8B4513,
    whitePiece: 0xF5DEB3,  blackPiece: 0x2A1A0A,
    whiteKing:  0xFFD700,  blackKing:  0xFFD700,
    border:     0x6B3A2A,
    emissiveW:  0x443322,  emissiveB: 0x000000,
    boardBg:    '#2d5a1b',
    ambientIntensity: 0.6,
    lightColor: 0xfff5e0,
    fogColor:   '#1a3d10'
  },
  green: {
    name: 'Tournament Green',
    lightTile:  0xC8E6C9,  darkTile:  0x388E3C,
    whitePiece: 0xF9F9E8,  blackPiece: 0x1A1A1A,
    whiteKing:  0xFFD700,  blackKing:  0xFFB300,
    border:     0x2E7D32,
    emissiveW:  0x334433,  emissiveB: 0x001100,
    boardBg:    '#1b3a1b',
    ambientIntensity: 0.55,
    lightColor: 0xe0ffe0,
    fogColor:   '#112211'
  },
  midnight: {
    name: 'Midnight Blue',
    lightTile:  0x5C7FA8,  darkTile:  0x1A2A4A,
    whitePiece: 0xE8EAF6,  blackPiece: 0xFF6F00,
    whiteKing:  0x80D8FF,  blackKing:  0xFFAB40,
    border:     0x0D1B3E,
    emissiveW:  0x112244,  emissiveB: 0x331100,
    boardBg:    '#0a0f1e',
    ambientIntensity: 0.45,
    lightColor: 0xaaccff,
    fogColor:   '#050a14'
  },
  red: {
    name: 'Championship Red',
    lightTile:  0xFFCDD2,  darkTile:  0xC62828,
    whitePiece: 0xE0E0E0,  blackPiece: 0x212121,
    whiteKing:  0xFFD700,  blackKing:  0xFFD700,
    border:     0x7B0000,
    emissiveW:  0x441111,  emissiveB: 0x110000,
    boardBg:    '#3a0000',
    ambientIntensity: 0.6,
    lightColor: 0xffe0e0,
    fogColor:   '#1a0000'
  },
  ivory: {
    name: 'Ivory & Ebony',
    lightTile:  0xFFFDE7,  darkTile:  0x37474F,
    whitePiece: 0xFFF9C4,  blackPiece: 0x263238,
    whiteKing:  0xFFC107,  blackKing:  0xFFC107,
    border:     0x455A64,
    emissiveW:  0x332200,  emissiveB: 0x001122,
    boardBg:    '#1c2830',
    ambientIntensity: 0.65,
    lightColor: 0xfffef0,
    fogColor:   '#101820'
  }
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
