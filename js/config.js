window.MiniHoK = window.MiniHoK || {};

MiniHoK.Config = {
  TEAM_BLUE: 0,
  TEAM_RED: 1,
  TEAM_NEUTRAL: 2,

  TEAM_COLORS: {
    0: { main: '#3ea6ff', dark: '#15528f', light: '#99d5ff', glow: 'rgba(62,166,255,0.45)' },
    1: { main: '#ff5656', dark: '#8f1d1d', light: '#ffaaaa', glow: 'rgba(255,86,86,0.45)' },
    2: { main: '#f0b429', dark: '#7c580b', light: '#ffe082', glow: 'rgba(240,180,41,0.45)' },
  },

  MODES: {
    '1v1': {
      id: '1v1',
      name: '1v1 墨家机关道',
      teamSize: 1,
      mapSize: 1850,
      startGold: 500,
      passiveGoldPerSec: 6,
      waveInterval: 20,
    },
    '3v3': {
      id: '3v3',
      name: '3v3 精简峡谷',
      teamSize: 3,
      mapSize: 2300,
      startGold: 400,
      passiveGoldPerSec: 5,
      waveInterval: 22,
    },
    '5v5': {
      id: '5v5',
      name: '5v5 经典三路',
      teamSize: 5,
      mapSize: 2700,
      startGold: 350,
      passiveGoldPerSec: 5,
      waveInterval: 24,
    },
  },

  MAX_LEVEL: 15,
  MAX_ITEMS: 6,
  RECALL_TIME: 3.0,
  FLASH_CD: 45,
  FLASH_RANGE: 210,
  HEAL_CD: 35,

  // Math utilities
  dist(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
  },

  angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  },

  clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  },

  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  xpForLevel(level) {
    return Math.round(140 + level * 95 + level * level * 15);
  },
};
