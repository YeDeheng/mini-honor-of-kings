window.MiniHoK = window.MiniHoK || {};

MiniHoK.Audio = (function () {
  let ctx = null;
  let muted = false;

  function ensureContext() {
    if (muted) return null;
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function tone(freqStart, freqEnd, duration, type, gainPeak, delay) {
    const c = ensureContext();
    if (!c) return;
    const now = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainPeak || 0.12, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  const SFX = {
    attack() {
      tone(320, 140, 0.08, 'triangle', 0.08);
    },
    hit() {
      tone(190, 80, 0.07, 'square', 0.06);
    },
    skill() {
      tone(360, 680, 0.14, 'sawtooth', 0.07);
    },
    ult() {
      tone(220, 880, 0.25, 'sawtooth', 0.11);
      tone(440, 1100, 0.28, 'triangle', 0.09, 0.05);
    },
    flash() {
      tone(700, 1600, 0.12, 'sine', 0.1);
    },
    heal() {
      tone(520, 780, 0.18, 'sine', 0.09);
      tone(660, 990, 0.2, 'sine', 0.08, 0.08);
    },
    gold() {
      tone(980, 1320, 0.09, 'sine', 0.07);
    },
    buy() {
      tone(640, 960, 0.1, 'triangle', 0.09);
      tone(960, 1280, 0.12, 'triangle', 0.08, 0.06);
    },
    levelup() {
      tone(523, 523, 0.1, 'triangle', 0.1, 0);
      tone(659, 659, 0.1, 'triangle', 0.1, 0.09);
      tone(784, 1046, 0.22, 'triangle', 0.12, 0.18);
    },
    kill() {
      tone(440, 660, 0.14, 'sawtooth', 0.11, 0);
      tone(660, 880, 0.24, 'triangle', 0.12, 0.11);
    },
    towerDestroy() {
      tone(140, 42, 0.45, 'sawtooth', 0.14);
      tone(220, 65, 0.35, 'square', 0.09, 0.06);
    },
    victory() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.12, i * 0.12));
    },
    defeat() {
      [392, 349, 311, 261].forEach((f, i) => tone(f, f * 0.95, 0.26, 'sawtooth', 0.09, i * 0.15));
    },
  };

  return {
    init: ensureContext,
    play(name) {
      if (muted || !SFX[name]) return;
      try {
        SFX[name]();
      } catch (_) {}
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
})();
