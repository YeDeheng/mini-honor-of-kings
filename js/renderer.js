window.MiniHoK = window.MiniHoK || {};

MiniHoK.Renderer = class Renderer {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.miniCanvas = minimapCanvas;
    this.miniCtx = minimapCanvas.getContext('2d');

    this.camera = { x: 0, y: 0, locked: true };
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.zoom = 1.0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    const minDim = Math.min(this.width, this.height);
    this.zoom = minDim >= 720 ? 1.0 : MiniHoK.Config.clamp(minDim / 680, 0.56, 1.0);
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  screenToWorld(sx, sy) {
    return {
      x: sx / this.zoom + this.camera.x,
      y: sy / this.zoom + this.camera.y,
    };
  }

  snapCameraTo(x, y, map) {
    const viewW = this.width / this.zoom;
    const viewH = this.height / this.zoom;
    this.camera.x = MiniHoK.Config.clamp(x - viewW / 2, 0, Math.max(0, map.width - viewW));
    this.camera.y = MiniHoK.Config.clamp(y - viewH / 2, 0, Math.max(0, map.height - viewH));
  }

  updateCamera(game, dt) {
    if (this.camera.locked && game.player) {
      const viewW = this.width / this.zoom;
      const viewH = this.height / this.zoom;
      const tx = MiniHoK.Config.clamp(
        game.player.x - viewW / 2,
        0,
        Math.max(0, game.map.width - viewW)
      );
      const ty = MiniHoK.Config.clamp(
        game.player.y - viewH / 2,
        0,
        Math.max(0, game.map.height - viewH)
      );
      const smooth = Math.min(1, dt * 10);
      this.camera.x += (tx - this.camera.x) * smooth;
      this.camera.y += (ty - this.camera.y) * smooth;
    }
  }

  render(game, aimPreview) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camera.x, -this.camera.y);

    this.drawTerrain(ctx, game.map, game.time);
    this.drawZones(ctx, game);
    this.drawStructures(ctx, game);
    this.drawSkillPreview(ctx, game, aimPreview);
    this.drawMonsters(ctx, game);
    this.drawMinions(ctx, game);
    this.drawHeroes(ctx, game);
    this.drawBushes(ctx, game);
    this.drawProjectiles(ctx, game);
    this.drawEffects(ctx, game);
    this.drawFloatingTexts(ctx, game);

    ctx.restore();

    this.renderMinimap(game);
  }

  // ==================== TERRAIN ====================
  drawTerrain(ctx, map, time) {
    const S = map.width;

    // Base rich canyon grass
    const bgGrad = ctx.createLinearGradient(0, S, S, 0);
    bgGrad.addColorStop(0, '#13242c');
    bgGrad.addColorStop(0.5, '#172b28');
    bgGrad.addColorStop(1, '#261a23');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, S, S);

    // Subtle tile grid for spatial movement feel
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.032)';
    ctx.lineWidth = 1;
    const step = 110;
    const viewW = this.width / this.zoom;
    const viewH = this.height / this.zoom;
    const startX = Math.floor(this.camera.x / step) * step;
    const startY = Math.floor(this.camera.y / step) * step;
    ctx.beginPath();
    for (let x = startX; x <= this.camera.x + viewW + step; x += step) {
      ctx.moveTo(x, this.camera.y);
      ctx.lineTo(x, this.camera.y + viewH);
    }
    for (let y = startY; y <= this.camera.y + viewH + step; y += step) {
      ctx.moveTo(this.camera.x, y);
      ctx.lineTo(this.camera.x + viewW, y);
    }
    ctx.stroke();

    // Diagonal River (Top-Left to Bottom-Right)
    ctx.save();
    ctx.strokeStyle = 'rgba(34, 120, 165, 0.38)';
    ctx.lineWidth = 110;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(S * 0.14, S * 0.14);
    ctx.lineTo(S * 0.86, S * 0.86);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(90, 195, 235, 0.18)';
    ctx.lineWidth = 52;
    ctx.beginPath();
    ctx.moveTo(S * 0.14, S * 0.14);
    ctx.lineTo(S * 0.86, S * 0.86);
    ctx.stroke();
    ctx.restore();

    // Draw Lanes (warm stone roads)
    for (const lane of map.lanes) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Road border
      ctx.strokeStyle = 'rgba(210, 185, 130, 0.14)';
      ctx.lineWidth = lane.width + 18;
      ctx.beginPath();
      lane.waypoints.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      // Road interior
      ctx.strokeStyle = '#27303b';
      ctx.lineWidth = lane.width;
      ctx.beginPath();
      lane.waypoints.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      // Subtle center line
      ctx.strokeStyle = 'rgba(240, 201, 109, 0.12)';
      ctx.lineWidth = 3;
      ctx.setLineDash([18, 22]);
      ctx.beginPath();
      lane.waypoints.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
    }

    // Base Platforms & Fountains
    map.fountains.forEach((f) => {
      const col = MiniHoK.Config.TEAM_COLORS[f.team];
      // Base plaza
      ctx.save();
      ctx.fillStyle = f.team === 0 ? 'rgba(30, 72, 120, 0.35)' : 'rgba(120, 35, 45, 0.35)';
      ctx.beginPath();
      ctx.arc(f.x + (f.team === 0 ? 110 : -110), f.y + (f.team === 0 ? -110 : 110), 270, 0, Math.PI * 2);
      ctx.fill();

      // Fountain glowing ring
      const pulse = 1 + Math.sin(time * 3) * 0.04;
      const grad = ctx.createRadialGradient(f.x, f.y, 12, f.x, f.y, f.radius * pulse);
      grad.addColorStop(0, col.light);
      grad.addColorStop(0.5, col.glow);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = col.main;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius * 0.78, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(f.team === 0 ? '蓝方泉水' : '红方泉水', f.x, f.y + 4);
      ctx.restore();
    });

    // Obstacles (Stone Pillars)
    for (const obs of map.obstacles) {
      ctx.save();
      ctx.fillStyle = '#1b2230';
      ctx.strokeStyle = 'rgba(212, 175, 95, 0.35)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#252f42';
      ctx.beginPath();
      ctx.arc(obs.x - 6, obs.y - 6, obs.radius * 0.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Jungle camp floor circles
    for (const c of map.camps) {
      ctx.save();
      ctx.strokeStyle =
        c.kind === 'red' ? 'rgba(255,90,90,0.28)' : c.kind === 'blue' ? 'rgba(80,175,255,0.28)' : 'rgba(240,190,60,0.38)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius + 36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ==================== STRUCTURES ====================
  drawStructures(ctx, game) {
    const player = game.player;
    const structs = [...game.map.towers, ...game.map.crystals];

    for (const st of structs) {
      const col = MiniHoK.Config.TEAM_COLORS[st.team];

      if (!st.alive) {
        // Ruined rubble
        ctx.save();
        ctx.fillStyle = 'rgba(20, 24, 34, 0.7)';
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.radius * 0.75, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }

      // Show enemy tower attack range indicator when player approaches!
      if (st.team !== player.team && player.alive) {
        const d = MiniHoK.Config.dist(player.x, player.y, st.x, st.y);
        if (d < st.range + 190) {
          const targetingPlayer = st.targetId === player.id;
          ctx.save();
          ctx.strokeStyle = targetingPlayer ? 'rgba(255, 60, 60, 0.9)' : 'rgba(255, 210, 90, 0.55)';
          ctx.fillStyle = targetingPlayer ? 'rgba(255, 60, 60, 0.1)' : 'rgba(255, 210, 90, 0.04)';
          ctx.lineWidth = targetingPlayer ? 3 : 2;
          ctx.setLineDash(targetingPlayer ? [] : [10, 8]);
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.range, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // Targeting laser line
      if (st.targetId) {
        const tgt = game.findUnitById(st.targetId);
        if (tgt && tgt.alive) {
          ctx.save();
          ctx.strokeStyle = tgt.isPlayer ? 'rgba(255, 65, 65, 0.75)' : col.glow;
          ctx.lineWidth = tgt.isPlayer ? 2.5 : 1.5;
          ctx.beginPath();
          ctx.moveTo(st.x, st.y);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.save();
      // Base plinth
      ctx.fillStyle = st.flashTimer > 0 ? '#fff' : '#1b2436';
      ctx.strokeStyle = col.main;
      ctx.lineWidth = st.type === 'crystal' ? 4 : 3;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Core gem
      const pulse = Math.sin(game.time * 4) * 3;
      const gemGrad = ctx.createRadialGradient(st.x, st.y, 4, st.x, st.y, st.radius * 0.65 + pulse);
      gemGrad.addColorStop(0, '#ffffff');
      gemGrad.addColorStop(0.45, col.main);
      gemGrad.addColorStop(1, col.dark);
      ctx.fillStyle = gemGrad;
      ctx.beginPath();
      if (st.type === 'crystal') {
        // Diamond crystal shape
        const r = st.radius * 0.62;
        ctx.moveTo(st.x, st.y - r);
        ctx.lineTo(st.x + r * 0.85, st.y);
        ctx.lineTo(st.x, st.y + r);
        ctx.lineTo(st.x - r * 0.85, st.y);
        ctx.closePath();
      } else {
        ctx.arc(st.x, st.y, st.radius * 0.52, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.restore();

      // HP Bar
      this.drawHpBar(ctx, st.x, st.y - st.radius - 16, st.type === 'crystal' ? 92 : 68, 8, st.hp / st.maxHp, col.main, 0);
    }
  }

  // ==================== BUSHES ====================
  drawBushes(ctx, game) {
    const player = game.player;
    for (const b of game.map.bushes) {
      const playerInside = player.alive && MiniHoK.Config.dist(player.x, player.y, b.x, b.y) <= b.radius;
      ctx.save();
      ctx.globalAlpha = playerInside ? 0.55 : 0.86;
      const grad = ctx.createRadialGradient(b.x, b.y, 8, b.x, b.y, b.radius);
      grad.addColorStop(0, '#1e5c3a');
      grad.addColorStop(0.7, '#154229');
      grad.addColorStop(1, 'rgba(16, 48, 30, 0.25)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();

      // Stylized grass tufts
      ctx.strokeStyle = '#38a169';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        const gx = b.x + Math.cos(a) * (b.radius * 0.45);
        const gy = b.y + Math.sin(a) * (b.radius * 0.45);
        ctx.beginPath();
        ctx.moveTo(gx - 5, gy + 5);
        ctx.lineTo(gx, gy - 6);
        ctx.lineTo(gx + 5, gy + 5);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ==================== HEROES ====================
  drawHeroes(ctx, game) {
    const playerTeam = game.player.team;

    for (const h of game.heroes) {
      if (!h.alive) continue;
      if (h.team !== playerTeam && !game.isVisibleToTeam(h, playerTeam)) continue;

      const col = MiniHoK.Config.TEAM_COLORS[h.team];
      const inBush = !!game.getBushAt(h.x, h.y);

      ctx.save();
      if (h.untargetable > 0) ctx.globalAlpha = 0.45;
      else if (inBush) ctx.globalAlpha = 0.65;

      // Li Bai Shadow Clone
      if (h.buffs.libaiShadow) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = '#74e3ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(h.buffs.libaiShadow.x, h.buffs.libaiShadow.y, 18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Arthur W orbiting shields
      if (h.buffs.arthurW > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 176, 65, 0.32)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 132, 0, Math.PI * 2);
        ctx.stroke();
        for (let s = 0; s < 3; s++) {
          const sa = game.time * 6.5 + (s * Math.PI * 2) / 3;
          const sx = h.x + Math.cos(sa) * 110;
          const sy = h.y + Math.sin(sa) * 110;
          ctx.fillStyle = '#ffe066';
          ctx.beginPath();
          ctx.arc(sx, sy, 9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Angela R (炽热光辉) Flame Laser Beam
      if (h.buffs.angelaLaser > 0) {
        ctx.save();
        const ang = h.buffs.angelaLaserAngle;
        const x2 = h.x + Math.cos(ang) * 470;
        const y2 = h.y + Math.sin(ang) * 470;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255, 100, 30, 0.45)';
        ctx.lineWidth = 34;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        ctx.strokeStyle = '#fff0a6';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      }

      // Player attack range soft ring
      if (h.isPlayer) {
        ctx.strokeStyle = 'rgba(240, 201, 109, 0.18)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.stats.range, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Buff auras (Red / Blue / Tyrant)
      if (h.buffs.redBuff > 0 || h.buffs.blueBuff > 0 || h.buffs.tyrantBuff > 0) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = h.buffs.tyrantBuff > 0 ? '#ffd43b' : h.buffs.redBuff > 0 ? '#ff6b6b' : '#4dabf7';
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius + 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Recall circle
      if (h.recalling) {
        ctx.strokeStyle = '#5ad8ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius + 11, -Math.PI / 2, -Math.PI / 2 + (h.recallTimer / MiniHoK.Config.RECALL_TIME) * Math.PI * 2);
        ctx.stroke();
      }

      // Hero body circle
      ctx.fillStyle = h.flashTimer > 0 ? '#ffffff' : h.template.color;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
      ctx.fill();

      // Team ring
      ctx.strokeStyle = h.isPlayer ? '#ffe699' : col.main;
      ctx.lineWidth = h.isPlayer ? 3.5 : 2.5;
      ctx.stroke();

      // Facing indicator dot
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(h.x + Math.cos(h.facing) * (h.radius - 4), h.y + Math.sin(h.facing) * (h.radius - 4), 4, 0, Math.PI * 2);
      ctx.fill();

      // Hero Emoji Icon
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(h.template.icon, h.x, h.y + 1);

      // Shield halo
      if (h.shield > 0) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Stun / Silence indicator
      if (h.stunTimer > 0) {
        ctx.fillStyle = '#ffe066';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('💫 眩晕', h.x, h.y - h.radius - 30);
      } else if (h.silenceTimer > 0) {
        ctx.fillStyle = '#ffa94d';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('🔇 沉默', h.x, h.y - h.radius - 30);
      }

      // Overhead Name, Level, HP/MP bars
      const barY = h.y - h.radius - 16;
      const hpColor = h.isPlayer ? '#38d97c' : h.team === playerTeam ? '#3ea6ff' : '#ff5656';
      this.drawHpBar(ctx, h.x, barY, 58, 7, h.hp / h.stats.maxHp, hpColor, h.shield / h.stats.maxHp);

      // Mana mini bar
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(h.x - 29, barY + 8, 58, 3);
      ctx.fillStyle = '#4dabf7';
      ctx.fillRect(h.x - 29, barY + 8, 58 * (h.mp / h.stats.maxMp), 3);

      // Level pill + name
      ctx.fillStyle = '#111827';
      ctx.strokeStyle = '#f0c96d';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(h.x - 36, barY + 4, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffe699';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(h.level, h.x - 36, barY + 4.5);

      ctx.fillStyle = h.isPlayer ? '#ffe699' : '#e2e8f0';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(h.name, h.x, barY - 7);

      ctx.restore();
    }
  }

  // ==================== MINIONS & MONSTERS ====================
  drawMinions(ctx, game) {
    for (const m of game.minions) {
      if (!m.alive) continue;
      const col = MiniHoK.Config.TEAM_COLORS[m.team];
      ctx.save();
      ctx.fillStyle = m.flashTimer > 0 ? '#fff' : col.main;
      ctx.strokeStyle = col.dark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (m.kind === 'cannon') {
        ctx.rect(m.x - m.radius, m.y - m.radius, m.radius * 2, m.radius * 2);
      } else {
        ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      if (m.hp < m.maxHp) {
        this.drawHpBar(ctx, m.x, m.y - m.radius - 9, 28, 4, m.hp / m.maxHp, col.main, 0);
      }
    }
  }

  drawMonsters(ctx, game) {
    for (const mon of game.monsters) {
      if (!mon.alive) continue;
      const fill = mon.kind === 'red' ? '#e74c3c' : mon.kind === 'blue' ? '#3498db' : '#f1c40f';
      const icon = mon.kind === 'red' ? '👹' : mon.kind === 'blue' ? '🗿' : '🐉';
      ctx.save();
      ctx.fillStyle = mon.flashTimer > 0 ? '#fff' : fill;
      ctx.strokeStyle = '#fff5cc';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(mon.x, mon.y, mon.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.font = mon.kind === 'tyrant' ? '26px sans-serif' : '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, mon.x, mon.y + 1);
      ctx.restore();

      this.drawHpBar(ctx, mon.x, mon.y - mon.radius - 13, 52, 6, mon.hp / mon.maxHp, '#f0b429', 0);
    }
  }

  // ==================== PROJECTILES, ZONES & VFX ====================
  drawZones(ctx, game) {
    for (const z of game.zones) {
      ctx.save();
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = z.color;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = z.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawProjectiles(ctx, game) {
    for (const p of game.projectiles) {
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawEffects(ctx, game) {
    for (const ef of game.effects) {
      const t = 1 - ef.life / ef.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);

      if (ef.type === 'ring') {
        ctx.strokeStyle = ef.color;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, ef.maxRadius * (0.25 + 0.75 * t), 0, Math.PI * 2);
        ctx.stroke();
      } else if (ef.type === 'slash') {
        ctx.strokeStyle = ef.color;
        ctx.lineWidth = 6 * (1 - t);
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, ef.radius, ef.angle - 0.9, ef.angle + 0.9);
        ctx.stroke();
      } else if (ef.type === 'dashLine') {
        ctx.strokeStyle = ef.color;
        ctx.lineWidth = 10 * (1 - t);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ef.x1, ef.y1);
        ctx.lineTo(ef.x2, ef.y2);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const pt of game.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawFloatingTexts(ctx, game) {
    ctx.save();
    ctx.textAlign = 'center';
    for (const ft of game.floatingTexts) {
      ctx.globalAlpha = Math.min(1, ft.life / ft.maxLife + 0.2);
      ctx.font = `800 ${ft.size}px sans-serif`;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.restore();
  }

  drawSkillPreview(ctx, game, aimPreview) {
    if (!aimPreview || !game.player || !game.player.alive) return;
    const hero = game.player;
    const skill = hero.template.skills[aimPreview.skillIndex];
    if (!skill) return;

    ctx.save();
    // Outer range ring
    ctx.strokeStyle = 'rgba(116, 227, 255, 0.55)';
    ctx.fillStyle = 'rgba(116, 227, 255, 0.08)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hero.x, hero.y, Math.min(skill.range, 600), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const ang = MiniHoK.Config.angle(hero.x, hero.y, aimPreview.aimX, aimPreview.aimY);
    if (skill.type === 'direction') {
      const len = Math.min(skill.range, 560);
      ctx.strokeStyle = 'rgba(255, 224, 102, 0.85)';
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hero.x, hero.y);
      ctx.lineTo(hero.x + Math.cos(ang) * len, hero.y + Math.sin(ang) * len);
      ctx.stroke();
    } else if (skill.type === 'aoe') {
      const d = Math.min(skill.range, MiniHoK.Config.dist(hero.x, hero.y, aimPreview.aimX, aimPreview.aimY));
      const tx = hero.x + Math.cos(ang) * d;
      const ty = hero.y + Math.sin(ang) * d;
      ctx.fillStyle = 'rgba(255, 212, 59, 0.22)';
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, skill.aoeRadius || 100, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  drawHpBar(ctx, cx, y, w, h, ratio, color, shieldRatio) {
    ratio = MiniHoK.Config.clamp(ratio, 0, 1);
    const x = cx - w / 2;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * ratio, h);
    if (shieldRatio > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fillRect(x + w * ratio, y, Math.min(w * (1 - ratio), w * shieldRatio), h);
    }
  }

  // ==================== MINIMAP ====================
  renderMinimap(game) {
    const ctx = this.miniCtx;
    const mw = this.miniCanvas.width;
    const mh = this.miniCanvas.height;
    const scale = mw / game.map.width;

    ctx.clearRect(0, 0, mw, mh);
    ctx.fillStyle = '#0d1921';
    ctx.fillRect(0, 0, mw, mh);

    // River
    ctx.strokeStyle = 'rgba(56, 165, 215, 0.4)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(mw * 0.14, mh * 0.14);
    ctx.lineTo(mw * 0.86, mh * 0.86);
    ctx.stroke();

    // Lanes
    ctx.strokeStyle = 'rgba(200, 185, 145, 0.32)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    for (const lane of game.map.lanes) {
      ctx.beginPath();
      lane.waypoints.forEach((p, idx) =>
        idx === 0 ? ctx.moveTo(p.x * scale, p.y * scale) : ctx.lineTo(p.x * scale, p.y * scale)
      );
      ctx.stroke();
    }

    // Structures
    for (const st of [...game.map.towers, ...game.map.crystals]) {
      if (!st.alive) continue;
      ctx.fillStyle = st.team === 0 ? '#3ea6ff' : '#ff5656';
      const r = st.type === 'crystal' ? 5 : 3.2;
      ctx.fillRect(st.x * scale - r, st.y * scale - r, r * 2, r * 2);
    }

    // Jungle Monsters
    for (const mon of game.monsters) {
      if (!mon.alive) continue;
      ctx.fillStyle = mon.kind === 'tyrant' ? '#ffd43b' : '#a8e6cf';
      ctx.beginPath();
      ctx.arc(mon.x * scale, mon.y * scale, mon.kind === 'tyrant' ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Minions
    for (const m of game.minions) {
      if (!m.alive) continue;
      ctx.fillStyle = m.team === 0 ? 'rgba(62,166,255,0.75)' : 'rgba(255,86,86,0.75)';
      ctx.fillRect(m.x * scale - 1.2, m.y * scale - 1.2, 2.4, 2.4);
    }

    // Heroes
    for (const h of game.heroes) {
      if (!h.alive) continue;
      if (h.team !== game.player.team && !game.isVisibleToTeam(h, game.player.team)) continue;
      ctx.fillStyle = h.isPlayer ? '#ffe699' : h.team === 0 ? '#3ea6ff' : '#ff5656';
      ctx.beginPath();
      ctx.arc(h.x * scale, h.y * scale, h.isPlayer ? 4.8 : 3.8, 0, Math.PI * 2);
      ctx.fill();
      if (h.isPlayer) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Camera viewport box
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      this.camera.x * scale,
      this.camera.y * scale,
      (this.width / this.zoom) * scale,
      (this.height / this.zoom) * scale
    );
  }
};
