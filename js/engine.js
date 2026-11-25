window.MiniHoK = window.MiniHoK || {};

MiniHoK.GameEngine = class GameEngine {
  constructor(modeId, playerHeroId, callbacks) {
    this.cfg = MiniHoK.Config;
    this.mode = this.cfg.MODES[modeId] || this.cfg.MODES['3v3'];
    this.modeId = this.mode.id;
    this.callbacks = callbacks || {};

    this.map = MiniHoK.Map.createMap(this.modeId);
    this.time = 0;
    this.paused = false;
    this.ended = false;
    this.winner = null;

    this.nextId = 1;
    this.heroes = [];
    this.minions = [];
    this.monsters = [];
    this.projectiles = [];
    this.zones = [];
    this.effects = [];
    this.floatingTexts = [];
    this.particles = [];

    this.scores = [0, 0];
    this.firstBloodTaken = false;
    this.waveCount = 0;
    this.waveTimer = 3.0; // First wave spawns at 3s
    this.passiveGoldTimer = 0;

    this.campStates = this.map.camps.map((c) => ({
      camp: c,
      monster: null,
      respawnTimer: c.initialDelay,
    }));

    this.spawnTeams(playerHeroId);
  }

  genId(prefix) {
    return `${prefix}_${this.nextId++}`;
  }

  spawnTeams(playerHeroId) {
    const { TEAM_BLUE, TEAM_RED } = this.cfg;
    const allTemplates = MiniHoK.Heroes.LIST;
    const teamSize = this.mode.teamSize;
    const lanes = this.map.lanes.map((l) => l.id);

    const pickLane = (idx) => {
      if (lanes.length === 1) return lanes[0];
      // 5v5 assignment: mid, top, bot, mid/jg, bot
      const order = ['mid', 'top', 'bot', 'top', 'bot'];
      return order[idx % order.length];
    };

    // Build Blue team (index 0 = player)
    const bluePool = [MiniHoK.Heroes.getById(playerHeroId)];
    for (const h of allTemplates) {
      if (bluePool.length >= teamSize) break;
      if (h.id !== playerHeroId) bluePool.push(h);
    }
    while (bluePool.length < teamSize) {
      bluePool.push(allTemplates[bluePool.length % allTemplates.length]);
    }

    // Build Red team (balanced mix)
    const redPool = [];
    for (let i = 0; i < teamSize; i++) {
      redPool.push(allTemplates[(i + 1) % allTemplates.length]);
    }

    bluePool.forEach((tpl, i) => {
      const h = this.createHero(tpl, TEAM_BLUE, i === 0, pickLane(i), i);
      this.heroes.push(h);
      if (i === 0) this.player = h;
    });

    redPool.forEach((tpl, i) => {
      const h = this.createHero(tpl, TEAM_RED, false, pickLane(i), i);
      this.heroes.push(h);
    });
  }

  createHero(template, team, isPlayer, lane, slotIndex) {
    const fountain = this.map.fountains[team];
    const spread = (slotIndex - 1.5) * 32;
    const hero = {
      id: this.genId('hero'),
      type: 'hero',
      team,
      isPlayer,
      lane,
      template,
      name: isPlayer ? `${template.shortName}(你)` : `${team === 0 ? '蓝' : '红'}·${template.shortName}`,
      x: fountain.x + (team === 0 ? 40 : -40) + spread * 0.5,
      y: fountain.y + (team === 0 ? -40 : 40) + spread * 0.5,
      radius: template.radius,
      facing: team === 0 ? -Math.PI / 4 : (3 * Math.PI) / 4,
      level: 1,
      xp: 0,
      gold: this.mode.startGold,
      items: [],
      stats: {},
      hp: template.base.maxHp,
      mp: template.base.maxMp,
      shield: 0,
      shieldTimer: 0,
      alive: true,
      respawnTimer: 0,
      attackTimer: 0,
      skillCds: [0, 0, 0],
      summonerCds: { flash: 0, heal: 0 },
      stunTimer: 0,
      silenceTimer: 0,
      slowTimer: 0,
      slowFactor: 0,
      untargetable: 0,
      lastCombatTime: -10,
      lastRevealTime: -10,
      recallTimer: 0,
      recalling: false,
      flashTimer: 0,
      // Hero-specific buffs & states
      buffs: {
        arthurQ: 0,
        arthurW: 0,
        arthurWTick: 0,
        houyiQ: 0,
        houyiStacks: 0,
        houyiStackTimer: 0,
        libaiStacks: 0,
        libaiBuff: 0,
        libaiQStage: 0,
        libaiQWindow: 0,
        libaiShadow: null,
        angelaLaser: 0,
        angelaLaserTick: 0,
        angelaLaserAngle: 0,
        redBuff: 0,
        blueBuff: 0,
        tyrantBuff: 0,
        speedBoost: 0,
        speedBoostAmt: 0,
      },
      // Match stats
      kills: 0,
      deaths: 0,
      assists: 0,
      damageDealt: 0,
      killStreak: 0,
      multiKill: 0,
      multiKillTimer: 0,
      recentDamagers: {},
      aiSeed: Math.random(),
    };

    this.recalcStats(hero, true);
    return hero;
  }

  recalcStats(hero, fillVitals) {
    const b = hero.template.base;
    const lvl = hero.level - 1;
    let maxHp = b.maxHp + b.hpPerLvl * lvl;
    let maxMp = b.maxMp + b.mpPerLvl * lvl;
    let ad = b.ad + b.adPerLvl * lvl;
    let ap = b.ap + b.apPerLvl * lvl;
    let armor = b.armor + b.armorPerLvl * lvl;
    let speed = b.speed;
    let aspd = 1.0;
    let crit = 0;
    let lifesteal = 0;
    let cdr = 0;

    for (const id of hero.items) {
      const it = MiniHoK.Items.getById(id);
      if (!it) continue;
      if (it.stats.maxHp) maxHp += it.stats.maxHp;
      if (it.stats.maxMp) maxMp += it.stats.maxMp;
      if (it.stats.ad) ad += it.stats.ad;
      if (it.stats.ap) ap += it.stats.ap;
      if (it.stats.armor) armor += it.stats.armor;
      if (it.stats.speed) speed += it.stats.speed;
      if (it.stats.aspd) aspd += it.stats.aspd;
      if (it.stats.crit) crit += it.stats.crit;
      if (it.stats.lifesteal) lifesteal += it.stats.lifesteal;
      if (it.stats.cdr) cdr += it.stats.cdr;
    }

    // Dynamic buffs
    if (hero.buffs.blueBuff > 0) cdr += 0.2;
    if (hero.buffs.tyrantBuff > 0) {
      ad += 24;
      ap += 35;
      speed += 20;
    }
    if (hero.buffs.libaiBuff > 0) ad *= 1.22;
    if (hero.buffs.houyiStacks > 0) aspd += hero.buffs.houyiStacks * 0.1;
    if (hero.buffs.arthurQ > 0) speed *= 1.38;
    if (hero.buffs.speedBoost > 0) speed *= 1 + hero.buffs.speedBoostAmt;
    if (hero.slowTimer > 0) speed *= 1 - hero.slowFactor;

    cdr = Math.min(0.4, cdr);
    const prevMaxHp = hero.stats.maxHp || maxHp;

    hero.stats = {
      maxHp: Math.round(maxHp),
      maxMp: Math.round(maxMp),
      ad: Math.round(ad),
      ap: Math.round(ap),
      armor: Math.round(armor),
      speed: Math.max(95, speed),
      range: b.range,
      attackCd: Math.max(0.28, b.attackCd / aspd),
      crit: Math.min(0.85, crit),
      lifesteal: Math.min(0.5, lifesteal),
      cdr,
    };

    if (fillVitals) {
      hero.hp = hero.stats.maxHp;
      hero.mp = hero.stats.maxMp;
    } else if (hero.stats.maxHp > prevMaxHp) {
      hero.hp = Math.min(hero.stats.maxHp, hero.hp + (hero.stats.maxHp - prevMaxHp));
    }
    hero.hp = Math.min(hero.hp, hero.stats.maxHp);
    hero.mp = Math.min(hero.mp, hero.stats.maxMp);
  }

  // ==================== MAIN UPDATE LOOP ====================
  update(dt, playerInput) {
    if (this.paused || this.ended) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;

    // Passive gold
    this.passiveGoldTimer += dt;
    if (this.passiveGoldTimer >= 1.0) {
      this.passiveGoldTimer -= 1.0;
      for (const h of this.heroes) {
        h.gold += this.mode.passiveGoldPerSec;
      }
    }

    // Minion wave spawn
    this.waveTimer -= dt;
    if (this.waveTimer <= 0) {
      this.waveTimer = this.mode.waveInterval;
      this.spawnMinionWave();
    }

    // Jungle camps spawn
    this.updateCamps(dt);

    // Update Heroes
    for (const h of this.heroes) {
      this.updateHero(h, dt, h.isPlayer ? playerInput : null);
    }

    // Update Minions, Monsters, Towers, Crystals
    this.updateMinions(dt);
    this.updateMonsters(dt);
    this.updateStructures(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateEffects(dt);
  }

  // ==================== HERO UPDATE & MOVEMENT ====================
  updateHero(hero, dt, input) {
    if (hero.flashTimer > 0) hero.flashTimer -= dt;
    if (hero.multiKillTimer > 0) {
      hero.multiKillTimer -= dt;
      if (hero.multiKillTimer <= 0) hero.multiKill = 0;
    }

    if (!hero.alive) {
      hero.respawnTimer -= dt;
      if (hero.respawnTimer <= 0) {
        const f = this.map.fountains[hero.team];
        hero.alive = true;
        hero.x = f.x + (hero.team === 0 ? 35 : -35);
        hero.y = f.y + (hero.team === 0 ? -35 : 35);
        hero.stunTimer = 0;
        hero.silenceTimer = 0;
        hero.slowTimer = 0;
        hero.shield = 0;
        hero.recalling = false;
        this.recalcStats(hero, true);
        this.spawnRingEffect(hero.x, hero.y, 48, '#66d9ff', 0.45);
      }
      return;
    }

    // Cooldowns & status timers
    hero.attackTimer = Math.max(0, hero.attackTimer - dt);
    for (let i = 0; i < 3; i++) {
      hero.skillCds[i] = Math.max(0, hero.skillCds[i] - dt);
    }
    hero.summonerCds.flash = Math.max(0, hero.summonerCds.flash - dt);
    hero.summonerCds.heal = Math.max(0, hero.summonerCds.heal - dt);

    hero.stunTimer = Math.max(0, hero.stunTimer - dt);
    hero.silenceTimer = Math.max(0, hero.silenceTimer - dt);
    hero.slowTimer = Math.max(0, hero.slowTimer - dt);
    hero.untargetable = Math.max(0, hero.untargetable - dt);

    if (hero.shieldTimer > 0) {
      hero.shieldTimer -= dt;
      if (hero.shieldTimer <= 0) hero.shield = 0;
    }

    // Update hero buffs
    this.updateHeroBuffs(hero, dt);
    this.recalcStats(hero, false);

    // Fountain healing
    const fountain = this.map.fountains[hero.team];
    if (this.cfg.dist(hero.x, hero.y, fountain.x, fountain.y) <= fountain.radius) {
      hero.hp = Math.min(hero.stats.maxHp, hero.hp + hero.stats.maxHp * 0.24 * dt);
      hero.mp = Math.min(hero.stats.maxMp, hero.mp + hero.stats.maxMp * 0.3 * dt);
    } else {
      // Natural regen + Blue buff + Arthur passive
      const mpRegen = (6 + hero.level * 0.6) * (hero.buffs.blueBuff > 0 ? 2.6 : 1);
      hero.mp = Math.min(hero.stats.maxMp, hero.mp + mpRegen * dt);

      let hpRegen = 3.5 + hero.level * 0.4;
      if (hero.template.id === 'arthur' && this.time - hero.lastCombatTime > 3.0) {
        hpRegen += hero.stats.maxHp * 0.03;
      }
      hero.hp = Math.min(hero.stats.maxHp, hero.hp + hpRegen * dt);
    }

    // Recall progress
    if (hero.recalling) {
      hero.recallTimer += dt;
      if (hero.recallTimer >= this.cfg.RECALL_TIME) {
        hero.recalling = false;
        hero.recallTimer = 0;
        this.spawnRingEffect(hero.x, hero.y, 45, '#5ad8ff', 0.4);
        hero.x = fountain.x;
        hero.y = fountain.y;
        hero.hp = hero.stats.maxHp;
        hero.mp = hero.stats.maxMp;
        this.spawnRingEffect(hero.x, hero.y, 55, '#5ad8ff', 0.5);
        if (hero.isPlayer) MiniHoK.Audio.play('heal');
      }
    }

    // Stunned or channeling laser locks normal movement
    if (hero.stunTimer > 0) return;

    if (hero.buffs.angelaLaser > 0) {
      let desired = hero.buffs.angelaLaserAngle;
      let turnRate = 2.4;
      if (hero.isPlayer && input) {
        if (input.moveX !== 0 || input.moveY !== 0) {
          desired = Math.atan2(input.moveY, input.moveX);
        } else if (input.useMouseAim) {
          desired = this.cfg.angle(hero.x, hero.y, input.aimX, input.aimY);
        } else {
          const smart = this.getSmartAimPoint(hero, 520, false);
          desired = this.cfg.angle(hero.x, hero.y, smart.x, smart.y);
        }
      } else {
        turnRate = 1.2;
        const smart = this.getSmartAimPoint(hero, 520, false);
        desired = this.cfg.angle(hero.x, hero.y, smart.x, smart.y);
      }
      let diff = desired - hero.buffs.angelaLaserAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      hero.buffs.angelaLaserAngle += this.cfg.clamp(diff, -turnRate * dt, turnRate * dt);
      hero.facing = hero.buffs.angelaLaserAngle;
      return;
    }

    // Player vs AI Control
    if (hero.isPlayer && input) {
      this.handlePlayerControl(hero, input, dt);
    } else {
      MiniHoK.AI.updateHeroAI(hero, this, dt);
    }
  }

  updateHeroBuffs(hero, dt) {
    const bf = hero.buffs;
    if (bf.arthurQ > 0) bf.arthurQ = Math.max(0, bf.arthurQ - dt);
    if (bf.houyiQ > 0) bf.houyiQ = Math.max(0, bf.houyiQ - dt);
    if (bf.houyiStackTimer > 0) {
      bf.houyiStackTimer -= dt;
      if (bf.houyiStackTimer <= 0) bf.houyiStacks = 0;
    }
    if (bf.libaiBuff > 0) bf.libaiBuff = Math.max(0, bf.libaiBuff - dt);
    if (bf.redBuff > 0) bf.redBuff = Math.max(0, bf.redBuff - dt);
    if (bf.blueBuff > 0) bf.blueBuff = Math.max(0, bf.blueBuff - dt);
    if (bf.tyrantBuff > 0) bf.tyrantBuff = Math.max(0, bf.tyrantBuff - dt);
    if (bf.speedBoost > 0) bf.speedBoost = Math.max(0, bf.speedBoost - dt);

    // Li Bai Q multi-cast window expiration
    if (bf.libaiQWindow > 0) {
      bf.libaiQWindow -= dt;
      if (bf.libaiQWindow <= 0) {
        bf.libaiQStage = 0;
        bf.libaiShadow = null;
        hero.skillCds[0] = hero.template.skills[0].cd * (1 - hero.stats.cdr);
      }
    }

    // Arthur W spinning shields tick
    if (bf.arthurW > 0) {
      bf.arthurW -= dt;
      bf.arthurWTick -= dt;
      if (bf.arthurWTick <= 0) {
        bf.arthurWTick = 0.42;
        const dmg = 36 + hero.stats.ad * 0.38 + hero.level * 5;
        this.forEachEnemyInRadius(hero.team, hero.x, hero.y, 138, (enemy) => {
          this.dealDamage(hero, enemy, dmg, 'physical');
        });
      }
    }

    // Angela R (炽热光辉) laser beam tick
    if (bf.angelaLaser > 0) {
      bf.angelaLaser -= dt;
      bf.angelaLaserTick -= dt;
      if (bf.angelaLaserTick <= 0) {
        bf.angelaLaserTick = 0.22;
        const range = 470;
        const ang = bf.angelaLaserAngle;
        const x2 = hero.x + Math.cos(ang) * range;
        const y2 = hero.y + Math.sin(ang) * range;
        const dmg = 32 + hero.stats.ap * 0.28 + hero.level * 5;
        for (const enemy of this.getAllEnemyUnits(hero.team)) {
          if (this.pointToSegmentDist(enemy.x, enemy.y, hero.x, hero.y, x2, y2) <= enemy.radius + 26) {
            this.dealDamage(hero, enemy, dmg, 'magic');
          }
        }
      }
    }
  }

  handlePlayerControl(hero, input, dt) {
    let mx = input.moveX;
    let my = input.moveY;

    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      hero.recalling = false;
      hero.facing = Math.atan2(my, mx);
      this.moveEntity(hero, mx, my, dt);
      input.moveTarget = null;
    } else if (input.moveTarget) {
      const d = this.cfg.dist(hero.x, hero.y, input.moveTarget.x, input.moveTarget.y);
      if (d > 10) {
        const ang = this.cfg.angle(hero.x, hero.y, input.moveTarget.x, input.moveTarget.y);
        hero.recalling = false;
        hero.facing = ang;
        this.moveEntity(hero, Math.cos(ang), Math.sin(ang), dt);
      } else {
        input.moveTarget = null;
      }
    }

    // Basic Attack (held left-click / Space / right-click target)
    if (input.attackHeld || input.attackTargetId) {
      let target = null;
      if (input.attackTargetId) {
        target = this.findUnitById(input.attackTargetId);
        if (!target || !target.alive || target.team === hero.team) {
          input.attackTargetId = null;
          target = null;
        }
      }
      if (!target) {
        target = this.findBestAttackTarget(
          hero,
          input.useMouseAim ? input.aimX : null,
          input.useMouseAim ? input.aimY : null
        );
      }

      if (target) {
        const d = this.cfg.dist(hero.x, hero.y, target.x, target.y);
        const effRange = hero.stats.range + (target.radius || 20) + (hero.buffs.arthurQ > 0 ? 55 : 0);
        if (d <= effRange) {
          this.performBasicAttack(hero, target);
        } else if (mx === 0 && my === 0) {
          const ang = this.cfg.angle(hero.x, hero.y, target.x, target.y);
          hero.facing = ang;
          this.moveEntity(hero, Math.cos(ang), Math.sin(ang), dt);
        }
      }
    }
  }

  moveEntity(entity, dx, dy, dt) {
    const speed = entity.stats ? entity.stats.speed : entity.speed;
    let nx = entity.x + dx * speed * dt;
    let ny = entity.y + dy * speed * dt;

    // World bounds
    const pad = entity.radius + 16;
    nx = this.cfg.clamp(nx, pad, this.map.width - pad);
    ny = this.cfg.clamp(ny, pad, this.map.height - pad);

    // Push out of stone obstacles
    for (const obs of this.map.obstacles) {
      const d = this.cfg.dist(nx, ny, obs.x, obs.y);
      const minD = obs.radius + entity.radius;
      if (d < minD && d > 0.01) {
        const push = (minD - d) / d;
        nx += (nx - obs.x) * push;
        ny += (ny - obs.y) * push;
      }
    }

    // Push out of alive towers/crystals
    for (const st of [...this.map.towers, ...this.map.crystals]) {
      if (!st.alive) continue;
      const d = this.cfg.dist(nx, ny, st.x, st.y);
      const minD = st.radius + entity.radius;
      if (d < minD && d > 0.01) {
        const push = (minD - d) / d;
        nx += (nx - st.x) * push;
        ny += (ny - st.y) * push;
      }
    }

    entity.x = nx;
    entity.y = ny;
  }

  // ==================== BASIC ATTACK & SKILLS ====================
  getSmartAimPoint(hero, maxRange, preferDirectionOnly) {
    if (!preferDirectionOnly) {
      let best = null;
      let bestScore = Infinity;
      const searchMax = Math.max(320, Math.min(maxRange + 140, 1200));
      for (const u of this.getAllEnemyUnits(hero.team)) {
        if (u.untargetable > 0) continue;
        if (u.type === 'hero' && !this.isVisibleToTeam(u, hero.team)) continue;
        const d = this.cfg.dist(hero.x, hero.y, u.x, u.y);
        if (d > searchMax + (u.radius || 20)) continue;
        // Strongly prioritize enemy heroes, then low-HP targets
        const typeBias = u.type === 'hero' ? -450 : u.type === 'monster' ? -80 : u.type === 'minion' ? -40 : 0;
        const score = d + typeBias;
        if (score < bestScore) {
          bestScore = score;
          best = u;
        }
      }
      if (best) return { x: best.x, y: best.y };
    }
    const distForward = Math.min(maxRange || 260, 260);
    return {
      x: hero.x + Math.cos(hero.facing) * distForward,
      y: hero.y + Math.sin(hero.facing) * distForward,
    };
  }

  findBestAttackTarget(hero, aimX, aimY) {
    const searchRange = hero.stats.range + 115;
    let best = null;
    let bestScore = Infinity;
    for (const u of this.getAllEnemyUnits(hero.team)) {
      if (u.untargetable > 0) continue;
      if (u.type === 'hero' && !this.isVisibleToTeam(u, hero.team)) continue;
      const dHero = this.cfg.dist(hero.x, hero.y, u.x, u.y);
      if (dHero > searchRange + (u.radius || 20)) continue;
      const dAim = aimX != null ? this.cfg.dist(aimX, aimY, u.x, u.y) : dHero;
      // Prefer heroes near cursor or low HP
      const typeWeight = u.type === 'hero' ? -130 : u.type === 'tower' || u.type === 'crystal' ? -20 : 0;
      const score = dAim * 0.55 + dHero * 0.45 + typeWeight;
      if (score < bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best;
  }

  performBasicAttack(hero, target) {
    if (hero.attackTimer > 0 || !hero.alive || !target || !target.alive) return;
    hero.attackTimer = hero.stats.attackCd;
    hero.recalling = false;
    hero.facing = this.cfg.angle(hero.x, hero.y, target.x, target.y);
    hero.lastRevealTime = this.time;

    if (hero.isPlayer) MiniHoK.Audio.play('attack');

    // Passive stacks
    if (hero.template.id === 'houyi') {
      hero.buffs.houyiStacks = Math.min(3, hero.buffs.houyiStacks + 1);
      hero.buffs.houyiStackTimer = 3.5;
    } else if (hero.template.id === 'libai') {
      hero.buffs.libaiStacks += 1;
      if (hero.buffs.libaiStacks >= 4) {
        hero.buffs.libaiStacks = 0;
        hero.buffs.libaiBuff = 5.0;
        this.spawnFloatingText(hero.x, hero.y - 32, '侠客行！攻+22%', '#74e3ff');
      }
    }

    // Arthur Empowered Q lunge
    let bonusDmg = 0;
    let applySilence = false;
    if (hero.buffs.arthurQ > 0) {
      hero.buffs.arthurQ = 0;
      bonusDmg = 85 + hero.stats.ad * 0.45;
      applySilence = true;
      const ang = this.cfg.angle(hero.x, hero.y, target.x, target.y);
      const jump = Math.min(65, Math.max(0, this.cfg.dist(hero.x, hero.y, target.x, target.y) - 42));
      hero.x += Math.cos(ang) * jump;
      hero.y += Math.sin(ang) * jump;
      this.spawnRingEffect(target.x, target.y, 58, '#ffe066', 0.3);
    }

    const isCrit = Math.random() < hero.stats.crit && target.type !== 'tower' && target.type !== 'crystal';
    const baseDmg = (hero.stats.ad + bonusDmg) * (isCrit ? 1.75 : 1.0);

    if (hero.template.attackType === 'melee') {
      this.spawnSlashEffect(hero.x, hero.y, hero.facing, hero.stats.range + 22, hero.template.color);
      this.dealDamage(hero, target, baseDmg, 'physical', isCrit);
      if (applySilence && target.type === 'hero') {
        target.silenceTimer = Math.max(target.silenceTimer, 1.0);
        this.spawnFloatingText(target.x, target.y - 38, '沉默!', '#ffe066');
      }
    } else {
      const mult = hero.buffs.houyiQ > 0 ? 1.18 : 1.0;
      this.spawnHomingProjectile(hero, target, baseDmg * mult, isCrit, hero.template.projColor || '#ffe066');

      // Hou Yi Q split arrows
      if (hero.buffs.houyiQ > 0) {
        let extra = 0;
        for (const u of this.getAllEnemyUnits(hero.team)) {
          if (u.id === target.id || !u.alive || u.untargetable > 0) continue;
          if (this.cfg.dist(hero.x, hero.y, u.x, u.y) <= hero.stats.range + 50) {
            this.spawnHomingProjectile(hero, u, hero.stats.ad * 0.55, false, '#ffd43b');
            extra++;
            if (extra >= 2) break;
          }
        }
      }
    }
  }

  castSkill(hero, index, aimX, aimY) {
    if (!hero.alive || hero.stunTimer > 0 || hero.silenceTimer > 0) return false;
    const skill = hero.template.skills[index];
    if (!skill) return false;

    if (index === 2 && hero.level < 4) {
      if (hero.isPlayer) this.spawnFloatingText(hero.x, hero.y - 34, '4级解锁大招', '#ffe066');
      return false;
    }

    // Special case: Li Bai Q stages 1 & 2 work while cooldown is 0 and window active
    const isLiBaiFollowup = hero.template.id === 'libai' && index === 0 && hero.buffs.libaiQStage > 0;
    if (!isLiBaiFollowup) {
      if (hero.skillCds[index] > 0) return false;
      if (hero.mp < skill.mana) {
        if (hero.isPlayer) this.spawnFloatingText(hero.x, hero.y - 34, '法力不足', '#4dabf7');
        return false;
      }
      hero.mp -= skill.mana;
    }

    hero.recalling = false;
    hero.lastRevealTime = this.time;
    const ang = this.cfg.angle(hero.x, hero.y, aimX, aimY);
    hero.facing = ang;

    const cdMult = 1 - hero.stats.cdr;
    if (!isLiBaiFollowup && !(hero.template.id === 'libai' && index === 0)) {
      hero.skillCds[index] = skill.cd * cdMult;
    }

    if (hero.isPlayer) {
      MiniHoK.Audio.play(index === 2 ? 'ult' : 'skill');
    }

    const id = hero.template.id;

    // -------------------- ARTHUR --------------------
    if (id === 'arthur') {
      if (index === 0) {
        hero.buffs.arthurQ = 3.0;
        this.spawnRingEffect(hero.x, hero.y, 48, '#ffd43b', 0.35);
      } else if (index === 1) {
        hero.buffs.arthurW = 3.5;
        hero.buffs.arthurWTick = 0;
        this.spawnRingEffect(hero.x, hero.y, 132, '#f5b041', 0.4);
      } else if (index === 2) {
        const d = Math.min(skill.range, this.cfg.dist(hero.x, hero.y, aimX, aimY));
        const tx = this.cfg.clamp(hero.x + Math.cos(ang) * d, 40, this.map.width - 40);
        const ty = this.cfg.clamp(hero.y + Math.sin(ang) * d, 40, this.map.height - 40);
        hero.x = tx;
        hero.y = ty;
        this.spawnRingEffect(tx, ty, skill.aoeRadius, '#ffe066', 0.55);
        this.spawnParticles(tx, ty, '#ffd43b', 18);
        this.forEachEnemyInRadius(hero.team, tx, ty, skill.aoeRadius, (e) => {
          const missingHp = (e.stats ? e.stats.maxHp : e.maxHp) - e.hp;
          const dmg = 170 + hero.stats.ad * 0.9 + missingHp * 0.16;
          this.dealDamage(hero, e, dmg, 'magic');
          if (e.type === 'hero' || e.type === 'minion') {
            e.stunTimer = Math.max(e.stunTimer || 0, 0.8);
          }
        });
      }
      return true;
    }

    // -------------------- ANGELA (安琪拉) --------------------
    if (id === 'angela') {
      if (index === 0) {
        const castId = this.genId('angelaQ');
        const hitCounts = {};
        [-0.18, -0.09, 0, 0.09, 0.18].forEach((offset) => {
          this.projectiles.push({
            id: this.genId('p'),
            owner: hero,
            team: hero.team,
            kind: 'skillshot',
            castId,
            hitCounts,
            repeatHitMult: 0.45,
            x: hero.x + Math.cos(ang + offset) * 20,
            y: hero.y + Math.sin(ang + offset) * 20,
            vx: Math.cos(ang + offset) * 660,
            vy: Math.sin(ang + offset) * 660,
            radius: 10,
            rangeLeft: skill.range,
            color: '#ff7b3b',
            damage: 36 + hero.stats.ap * 0.28 + hero.level * 4,
            damageType: 'magic',
            pierce: false,
          });
        });
      } else if (index === 1) {
        this.projectiles.push({
          id: this.genId('p'),
          owner: hero,
          team: hero.team,
          kind: 'angelaW',
          x: hero.x + Math.cos(ang) * 22,
          y: hero.y + Math.sin(ang) * 22,
          vx: Math.cos(ang) * 460,
          vy: Math.sin(ang) * 460,
          radius: 16,
          rangeLeft: skill.range,
          color: '#ff4d29',
          damage: 78 + hero.stats.ap * 0.48 + hero.level * 7,
          damageType: 'magic',
          aoeRadius: skill.aoeRadius,
        });
      } else if (index === 2) {
        hero.shield = Math.max(hero.shield, 140 + hero.stats.ap * 0.55);
        hero.shieldTimer = 2.0;
        hero.buffs.angelaLaser = 1.6;
        hero.buffs.angelaLaserTick = 0.08;
        hero.buffs.angelaLaserAngle = ang;
      }
      return true;
    }

    // -------------------- HOU YI --------------------
    if (id === 'houyi') {
      if (index === 0) {
        hero.buffs.houyiQ = 4.5;
        this.spawnRingEffect(hero.x, hero.y, 46, '#ffd43b', 0.35);
      } else if (index === 1) {
        const d = Math.min(skill.range, this.cfg.dist(hero.x, hero.y, aimX, aimY));
        const tx = this.cfg.clamp(hero.x + Math.cos(ang) * d, 40, this.map.width - 40);
        const ty = this.cfg.clamp(hero.y + Math.sin(ang) * d, 40, this.map.height - 40);
        this.spawnRingEffect(tx, ty, skill.aoeRadius, '#ffbe3b', 0.5);
        this.spawnParticles(tx, ty, '#ffe066', 16);
        this.forEachEnemyInRadius(hero.team, tx, ty, skill.aoeRadius, (e) => {
          const isCenter = this.cfg.dist(tx, ty, e.x, e.y) < skill.aoeRadius * 0.45;
          const dmg = (95 + hero.stats.ad * 0.68 + hero.level * 8) * (isCenter ? 1.3 : 1.0);
          this.dealDamage(hero, e, dmg, 'magic');
          if (e.type === 'hero' || e.type === 'minion') {
            e.slowTimer = Math.max(e.slowTimer || 0, 2.0);
            e.slowFactor = Math.max(e.slowFactor || 0, 0.35);
          }
        });
      } else if (index === 2) {
        this.projectiles.push({
          id: this.genId('p'),
          owner: hero,
          team: hero.team,
          kind: 'houyiUlt',
          startX: hero.x,
          startY: hero.y,
          x: hero.x + Math.cos(ang) * 24,
          y: hero.y + Math.sin(ang) * 24,
          vx: Math.cos(ang) * 760,
          vy: Math.sin(ang) * 760,
          radius: 22,
          rangeLeft: skill.range,
          color: '#ff9500',
          damage: 175 + hero.stats.ad * 0.95 + hero.level * 12,
          damageType: 'magic',
        });
      }
      return true;
    }

    // -------------------- LI BAI --------------------
    if (id === 'libai') {
      if (index === 0) {
        const bf = hero.buffs;
        if (bf.libaiQStage === 0) {
          bf.libaiShadow = { x: hero.x, y: hero.y };
          this.dashAndStrike(hero, ang, skill.range, 82 + hero.stats.ad * 0.68, 0.45);
          bf.libaiQStage = 1;
          bf.libaiQWindow = 4.0;
          hero.skillCds[0] = 0.25;
        } else if (bf.libaiQStage === 1) {
          this.dashAndStrike(hero, ang, skill.range, 90 + hero.stats.ad * 0.72, 0.45);
          bf.libaiQStage = 2;
          bf.libaiQWindow = 3.5;
          hero.skillCds[0] = 0.25;
        } else {
          if (bf.libaiShadow) {
            this.spawnRingEffect(hero.x, hero.y, 38, '#5ad8ff', 0.3);
            hero.x = bf.libaiShadow.x;
            hero.y = bf.libaiShadow.y;
            this.spawnRingEffect(hero.x, hero.y, 44, '#5ad8ff', 0.35);
          }
          bf.libaiQStage = 0;
          bf.libaiQWindow = 0;
          bf.libaiShadow = null;
          hero.skillCds[0] = skill.cd * cdMult;
        }
      } else if (index === 1) {
        hero.untargetable = Math.max(hero.untargetable, 0.55);
        this.spawnRingEffect(hero.x, hero.y, skill.range, '#74e3ff', 0.65);
        this.spawnParticles(hero.x, hero.y, '#99eeff', 18);
        const dmg = 110 + hero.stats.ad * 0.78 + hero.level * 8;
        this.forEachEnemyInRadius(hero.team, hero.x, hero.y, skill.range, (e) => {
          this.dealDamage(hero, e, dmg, 'physical');
          if (e.type === 'hero' || e.type === 'minion') {
            e.slowTimer = Math.max(e.slowTimer || 0, 1.8);
            e.slowFactor = Math.max(e.slowFactor || 0, 0.4);
          }
        });
      } else if (index === 2) {
        hero.untargetable = Math.max(hero.untargetable, 0.85);
        const cx = hero.x + Math.cos(ang) * 115;
        const cy = hero.y + Math.sin(ang) * 115;
        this.zones.push({
          id: this.genId('z'),
          owner: hero,
          team: hero.team,
          kind: 'libaiUlt',
          x: cx,
          y: cy,
          radius: 155,
          duration: 0.72,
          tickInterval: 0.15,
          tickTimer: 0.04,
          damage: 56 + hero.stats.ad * 0.44 + hero.level * 6,
          damageType: 'physical',
          color: '#5ad8ff',
        });
      }
      return true;
    }

    return false;
  }

  dashAndStrike(hero, ang, distLen, dmg, stunDur) {
    const startX = hero.x;
    const startY = hero.y;
    const tx = this.cfg.clamp(hero.x + Math.cos(ang) * distLen, 36, this.map.width - 36);
    const ty = this.cfg.clamp(hero.y + Math.sin(ang) * distLen, 36, this.map.height - 36);
    hero.x = tx;
    hero.y = ty;
    this.effects.push({ type: 'dashLine', x1: startX, y1: startY, x2: tx, y2: ty, color: '#74e3ff', life: 0.3, maxLife: 0.3 });
    this.spawnRingEffect(tx, ty, 66, '#74e3ff', 0.35);

    for (const enemy of this.getAllEnemyUnits(hero.team)) {
      if (this.pointToSegmentDist(enemy.x, enemy.y, startX, startY, tx, ty) <= enemy.radius + 46) {
        this.dealDamage(hero, enemy, dmg, 'physical');
        if (enemy.type === 'hero' || enemy.type === 'minion') {
          enemy.stunTimer = Math.max(enemy.stunTimer || 0, stunDur);
        }
      }
    }
  }

  // ==================== SUMMONER SPELLS ====================
  castFlash(hero, aimX, aimY) {
    if (!hero.alive || hero.stunTimer > 0 || hero.summonerCds.flash > 0) return false;
    const ang = this.cfg.angle(hero.x, hero.y, aimX, aimY);
    const ox = hero.x;
    const oy = hero.y;
    hero.x = this.cfg.clamp(hero.x + Math.cos(ang) * this.cfg.FLASH_RANGE, 36, this.map.width - 36);
    hero.y = this.cfg.clamp(hero.y + Math.sin(ang) * this.cfg.FLASH_RANGE, 36, this.map.height - 36);
    hero.recalling = false;
    hero.summonerCds.flash = this.cfg.FLASH_CD;
    this.effects.push({ type: 'dashLine', x1: ox, y1: oy, x2: hero.x, y2: hero.y, color: '#ffe066', life: 0.28, maxLife: 0.28 });
    this.spawnRingEffect(hero.x, hero.y, 44, '#ffe066', 0.35);
    if (hero.isPlayer) MiniHoK.Audio.play('flash');
    return true;
  }

  castHeal(hero) {
    if (!hero.alive || hero.summonerCds.heal > 0) return false;
    hero.summonerCds.heal = this.cfg.HEAL_CD;
    const healAmt = Math.round(hero.stats.maxHp * 0.2 + 120);
    for (const ally of this.heroes) {
      if (!ally.alive || ally.team !== hero.team) continue;
      if (this.cfg.dist(hero.x, hero.y, ally.x, ally.y) <= 280) {
        ally.hp = Math.min(ally.stats.maxHp, ally.hp + healAmt);
        ally.buffs.speedBoost = 2.0;
        ally.buffs.speedBoostAmt = 0.22;
        this.spawnFloatingText(ally.x, ally.y - 30, `+${healAmt}`, '#38d97c');
        this.spawnRingEffect(ally.x, ally.y, 50, '#38d97c', 0.4);
      }
    }
    if (hero.isPlayer) MiniHoK.Audio.play('heal');
    return true;
  }

  startRecall(hero) {
    if (!hero.alive || hero.stunTimer > 0 || hero.recalling) return false;
    hero.recalling = true;
    hero.recallTimer = 0;
    return true;
  }

  // ==================== SHOPPING ====================
  buyItem(hero, itemId) {
    const it = MiniHoK.Items.getById(itemId);
    if (!it || hero.items.length >= this.cfg.MAX_ITEMS || hero.gold < it.price) return false;
    hero.gold -= it.price;
    hero.items.push(itemId);
    this.recalcStats(hero, false);
    if (hero.isPlayer) {
      MiniHoK.Audio.play('buy');
      this.spawnFloatingText(hero.x, hero.y - 36, `购得 ${it.name}`, '#ffe066');
    }
    return true;
  }

  sellItem(hero, slotIndex) {
    if (slotIndex < 0 || slotIndex >= hero.items.length) return false;
    const it = MiniHoK.Items.getById(hero.items[slotIndex]);
    if (!it) return false;
    hero.items.splice(slotIndex, 1);
    const refund = Math.round(it.price * 0.7);
    hero.gold += refund;
    this.recalcStats(hero, false);
    if (hero.isPlayer) MiniHoK.Audio.play('gold');
    return true;
  }

  // ==================== MINIONS ====================
  spawnMinionWave() {
    this.waveCount++;
    const isCannonWave = this.waveCount % 3 === 0;
    const scale = 1 + Math.min(1.5, this.time / 480);

    for (const lane of this.map.lanes) {
      [this.cfg.TEAM_BLUE, this.cfg.TEAM_RED].forEach((team) => {
        const pts = team === this.cfg.TEAM_BLUE ? lane.waypoints : [...lane.waypoints].reverse();
        const origin = pts[0];
        const kinds = isCannonWave ? ['melee', 'melee', 'ranged', 'cannon'] : ['melee', 'melee', 'ranged'];

        kinds.forEach((kind, idx) => {
          const jitterAngle = (idx / kinds.length) * Math.PI * 2;
          const isMelee = kind === 'melee';
          const isCannon = kind === 'cannon';
          this.minions.push({
            id: this.genId('m'),
            type: 'minion',
            kind,
            team,
            lane: lane.id,
            waypoints: pts,
            wpIndex: 1,
            x: origin.x + Math.cos(jitterAngle) * 26,
            y: origin.y + Math.sin(jitterAngle) * 26,
            radius: isCannon ? 17 : 13,
            hp: Math.round((isCannon ? 680 : isMelee ? 430 : 280) * scale),
            maxHp: Math.round((isCannon ? 680 : isMelee ? 430 : 280) * scale),
            ad: Math.round((isCannon ? 46 : isMelee ? 24 : 30) * scale),
            range: isMelee ? 42 : isCannon ? 185 : 165,
            speed: 145,
            attackCd: isCannon ? 1.25 : 1.05,
            attackTimer: Math.random() * 0.3,
            goldValue: isCannon ? 68 : isMelee ? 36 : 30,
            xpValue: isCannon ? 65 : 38,
            alive: true,
            stunTimer: 0,
            slowTimer: 0,
            slowFactor: 0,
            flashTimer: 0,
          });
        });
      });
    }
  }

  updateMinions(dt) {
    for (let i = this.minions.length - 1; i >= 0; i--) {
      const m = this.minions[i];
      if (!m.alive) {
        this.minions.splice(i, 1);
        continue;
      }
      if (m.flashTimer > 0) m.flashTimer -= dt;
      if (m.attackTimer > 0) m.attackTimer -= dt;
      if (m.stunTimer > 0) {
        m.stunTimer -= dt;
        continue;
      }
      if (m.slowTimer > 0) m.slowTimer -= dt;

      // Find nearest enemy target in aggro range
      let target = null;
      let bestDist = 250;
      for (const other of this.minions) {
        if (!other.alive || other.team === m.team) continue;
        const d = this.cfg.dist(m.x, m.y, other.x, other.y);
        if (d < bestDist) {
          bestDist = d;
          target = other;
        }
      }
      if (!target) {
        for (const h of this.heroes) {
          if (!h.alive || h.team === m.team || h.untargetable > 0) continue;
          if (!this.isVisibleToTeam(h, m.team)) continue;
          const d = this.cfg.dist(m.x, m.y, h.x, h.y);
          if (d < bestDist) {
            bestDist = d;
            target = h;
          }
        }
      }
      if (!target) {
        const enemyTeam = m.team === 0 ? 1 : 0;
        const structs = [...this.map.towers, this.map.crystals[enemyTeam]];
        for (const st of structs) {
          if (!st.alive || st.team === m.team) continue;
          const d = this.cfg.dist(m.x, m.y, st.x, st.y);
          if (d < 290) {
            target = st;
            break;
          }
        }
      }

      if (target) {
        const d = this.cfg.dist(m.x, m.y, target.x, target.y);
        const effRange = m.range + (target.radius || 14);
        if (d <= effRange) {
          if (m.attackTimer <= 0) {
            m.attackTimer = m.attackCd;
            if (m.kind === 'melee') {
              this.dealDamage(m, target, m.ad, 'physical');
            } else {
              this.spawnHomingProjectile(m, target, m.ad, false, m.team === 0 ? '#66c2ff' : '#ff8585');
            }
          }
        } else {
          const ang = this.cfg.angle(m.x, m.y, target.x, target.y);
          const spd = m.speed * (m.slowTimer > 0 ? 1 - m.slowFactor : 1);
          m.x += Math.cos(ang) * spd * dt;
          m.y += Math.sin(ang) * spd * dt;
        }
      } else {
        // March along lane waypoints
        const wp = m.waypoints[Math.min(m.wpIndex, m.waypoints.length - 1)];
        const d = this.cfg.dist(m.x, m.y, wp.x, wp.y);
        if (d < 36 && m.wpIndex < m.waypoints.length - 1) {
          m.wpIndex++;
        } else {
          const ang = this.cfg.angle(m.x, m.y, wp.x, wp.y);
          const spd = m.speed * (m.slowTimer > 0 ? 1 - m.slowFactor : 1);
          m.x += Math.cos(ang) * spd * dt;
          m.y += Math.sin(ang) * spd * dt;
        }
      }
    }
  }

  // ==================== JUNGLE MONSTERS ====================
  updateCamps(dt) {
    for (const cs of this.campStates) {
      if (cs.monster && cs.monster.alive) continue;
      cs.respawnTimer -= dt;
      if (cs.respawnTimer <= 0) {
        const c = cs.camp;
        const scale = 1 + Math.min(1.2, this.time / 500);
        const mon = {
          id: this.genId('mon'),
          type: 'monster',
          kind: c.kind,
          name: c.name,
          team: this.cfg.TEAM_NEUTRAL,
          homeX: c.x,
          homeY: c.y,
          x: c.x,
          y: c.y,
          radius: c.radius,
          hp: Math.round(c.hp * scale),
          maxHp: Math.round(c.hp * scale),
          ad: Math.round(c.ad * scale),
          goldValue: c.gold,
          xpValue: c.xp,
          range: 62,
          speed: 165,
          attackCd: 1.15,
          attackTimer: 0,
          aggroTargetId: null,
          alive: true,
          flashTimer: 0,
          campState: cs,
        };
        cs.monster = mon;
        this.monsters.push(mon);
        if (c.kind === 'tyrant') {
          this.announce('暴君已降临峡谷！', 'TYRANT HAS SPAWNED');
        }
      }
    }
  }

  updateMonsters(dt) {
    for (let i = this.monsters.length - 1; i >= 0; i--) {
      const mon = this.monsters[i];
      if (!mon.alive) {
        mon.campState.monster = null;
        mon.campState.respawnTimer = mon.campState.camp.respawnTime;
        this.monsters.splice(i, 1);
        continue;
      }
      if (mon.flashTimer > 0) mon.flashTimer -= dt;
      if (mon.attackTimer > 0) mon.attackTimer -= dt;

      const dHome = this.cfg.dist(mon.x, mon.y, mon.homeX, mon.homeY);
      let target = mon.aggroTargetId ? this.findUnitById(mon.aggroTargetId) : null;
      if (!target || !target.alive || dHome > 320 || this.cfg.dist(mon.x, mon.y, target.x, target.y) > 360) {
        mon.aggroTargetId = null;
        target = null;
      }

      if (target) {
        const d = this.cfg.dist(mon.x, mon.y, target.x, target.y);
        if (d <= mon.range + target.radius) {
          if (mon.attackTimer <= 0) {
            mon.attackTimer = mon.attackCd;
            this.dealDamage(mon, target, mon.ad, 'physical');
          }
        } else {
          const ang = this.cfg.angle(mon.x, mon.y, target.x, target.y);
          mon.x += Math.cos(ang) * mon.speed * dt;
          mon.y += Math.sin(ang) * mon.speed * dt;
        }
      } else if (dHome > 8) {
        const ang = this.cfg.angle(mon.x, mon.y, mon.homeX, mon.homeY);
        mon.x += Math.cos(ang) * mon.speed * dt;
        mon.y += Math.sin(ang) * mon.speed * dt;
        mon.hp = Math.min(mon.maxHp, mon.hp + mon.maxHp * 0.14 * dt);
      }
    }
  }

  // ==================== TOWERS & CRYSTALS ====================
  updateStructures(dt) {
    const structs = [...this.map.towers, ...this.map.crystals];
    for (const st of structs) {
      if (!st.alive) continue;
      if (st.flashTimer > 0) st.flashTimer -= dt;
      if (st.cdTimer > 0) st.cdTimer -= dt;

      // Validate current target
      let target = st.targetId ? this.findUnitById(st.targetId) : null;
      if (
        !target ||
        !target.alive ||
        target.untargetable > 0 ||
        this.cfg.dist(st.x, st.y, target.x, target.y) > st.range + (target.radius || 16)
      ) {
        target = null;
        st.targetId = null;
      }

      // Pick new target: minions first, then heroes
      if (!target) {
        let bestMinion = null;
        let minD = st.range + 20;
        for (const m of this.minions) {
          if (!m.alive || m.team === st.team) continue;
          const d = this.cfg.dist(st.x, st.y, m.x, m.y);
          if (d < minD) {
            minD = d;
            bestMinion = m;
          }
        }
        if (bestMinion) {
          target = bestMinion;
        } else {
          let bestHero = null;
          let minHD = st.range + 22;
          for (const h of this.heroes) {
            if (!h.alive || h.team === st.team || h.untargetable > 0) continue;
            const d = this.cfg.dist(st.x, st.y, h.x, h.y);
            if (d < minHD) {
              minHD = d;
              bestHero = h;
            }
          }
          target = bestHero;
        }
        st.targetId = target ? target.id : null;
      }

      if (target && st.cdTimer <= 0) {
        st.cdTimer = st.attackCd;
        this.spawnHomingProjectile(st, target, st.ad, false, st.team === 0 ? '#4dabf7' : '#ff6b6b', 10, 560);
      }
    }
  }

  // ==================== PROJECTILES & ZONES ====================
  spawnHomingProjectile(owner, target, damage, isCrit, color, radius, speed) {
    this.projectiles.push({
      id: this.genId('p'),
      owner,
      team: owner.team,
      kind: 'homing',
      target,
      x: owner.x,
      y: owner.y,
      speed: speed || 620,
      radius: radius || 6,
      color: color || '#ffe066',
      damage,
      damageType: 'physical',
      isCrit: !!isCrit,
    });
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      if (p.kind === 'homing') {
        if (!p.target || !p.target.alive || p.target.untargetable > 0) {
          this.projectiles.splice(i, 1);
          continue;
        }
        const d = this.cfg.dist(p.x, p.y, p.target.x, p.target.y);
        const step = p.speed * dt;
        if (d <= step + (p.target.radius || 14)) {
          this.dealDamage(p.owner, p.target, p.damage, p.damageType, p.isCrit);
          this.projectiles.splice(i, 1);
        } else {
          const ang = this.cfg.angle(p.x, p.y, p.target.x, p.target.y);
          p.x += Math.cos(ang) * step;
          p.y += Math.sin(ang) * step;
        }
        continue;
      }

      // Linear skillshots
      const stepX = p.vx * dt;
      const stepY = p.vy * dt;
      p.x += stepX;
      p.y += stepY;
      p.rangeLeft -= Math.hypot(stepX, stepY);

      let exploded = false;

      if (p.kind === 'houyiUlt') {
        // Only hits enemy heroes
        for (const h of this.heroes) {
          if (!h.alive || h.team === p.team || h.untargetable > 0) continue;
          if (this.cfg.dist(p.x, p.y, h.x, h.y) <= h.radius + p.radius) {
            const traveled = this.cfg.dist(p.startX, p.startY, p.x, p.y);
            const stunDur = this.cfg.clamp(0.9 + (traveled / 950) * 1.1, 0.9, 2.0);
            this.spawnRingEffect(p.x, p.y, 120, '#ff9500', 0.55);
            this.spawnParticles(p.x, p.y, '#ffbe3b', 22);
            this.forEachEnemyInRadius(p.team, p.x, p.y, 120, (e) => {
              this.dealDamage(p.owner, e, p.damage, 'magic');
              if (e.type === 'hero') {
                e.stunTimer = Math.max(e.stunTimer, stunDur);
                this.spawnFloatingText(e.x, e.y - 42, `眩晕 ${stunDur.toFixed(1)}s`, '#ffd43b');
              }
            });
            exploded = true;
            break;
          }
        }
      } else {
        for (const u of this.getAllEnemyUnits(p.team)) {
          if (u.untargetable > 0 || u.type === 'tower' || u.type === 'crystal') continue;
          if (this.cfg.dist(p.x, p.y, u.x, u.y) <= u.radius + p.radius) {
            if (p.kind === 'angelaW') {
              this.detonateAngelaW(p);
            } else {
              let dmg = p.damage;
              if (p.castId && p.hitCounts) {
                const prevHits = p.hitCounts[u.id] || 0;
                p.hitCounts[u.id] = prevHits + 1;
                if (prevHits > 0) {
                  dmg *= p.repeatHitMult || 0.45;
                }
              }
              this.dealDamage(p.owner, u, dmg, p.damageType);
              this.spawnParticles(p.x, p.y, p.color, 6);
            }
            exploded = true;
            break;
          }
        }
      }

      if (exploded || p.rangeLeft <= 0 || p.x < 0 || p.y < 0 || p.x > this.map.width || p.y > this.map.height) {
        if (!exploded && p.kind === 'angelaW') {
          this.detonateAngelaW(p);
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  detonateAngelaW(p) {
    this.spawnRingEffect(p.x, p.y, p.aoeRadius, '#ff5c33', 0.5);
    this.spawnParticles(p.x, p.y, '#ff7b3b', 16);
    this.forEachEnemyInRadius(p.team, p.x, p.y, p.aoeRadius, (e) => {
      this.dealDamage(p.owner, e, p.damage, 'magic');
      if (e.type === 'hero' || e.type === 'minion') {
        e.stunTimer = Math.max(e.stunTimer || 0, 0.85);
      }
    });
    // Persistent fire vortex zone
    this.zones.push({
      id: this.genId('z'),
      owner: p.owner,
      team: p.team,
      kind: 'fireVortex',
      x: p.x,
      y: p.y,
      radius: p.aoeRadius,
      duration: 1.8,
      tickInterval: 0.45,
      tickTimer: 0.35,
      damage: 22 + p.owner.stats.ap * 0.18,
      damageType: 'magic',
      color: '#ff6b35',
    });
  }

  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.duration -= dt;
      z.tickTimer -= dt;
      if (z.tickTimer <= 0) {
        z.tickTimer = z.tickInterval;
        if (z.kind === 'libaiUlt') {
          this.spawnSlashEffect(z.x, z.y, Math.random() * Math.PI * 2, z.radius * 0.85, '#74e3ff');
        }
        this.forEachEnemyInRadius(z.team, z.x, z.y, z.radius, (e) => {
          this.dealDamage(z.owner, e, z.damage, z.damageType);
          if (z.kind === 'fireVortex' && (e.type === 'hero' || e.type === 'minion')) {
            e.slowTimer = Math.max(e.slowTimer || 0, 0.6);
            e.slowFactor = Math.max(e.slowFactor || 0, 0.25);
          }
        });
      }
      if (z.duration <= 0) {
        this.zones.splice(i, 1);
      }
    }
  }

  // ==================== DAMAGE & KILLS ====================
  dealDamage(attacker, target, rawDamage, dmgType, isCrit) {
    if (!target || !target.alive || target.untargetable > 0) return 0;

    // Backdoor protection on structures without nearby enemy minions
    let dmg = rawDamage;
    if (target.type === 'tower' || target.type === 'crystal') {
      const hasMinion = this.minions.some(
        (m) => m.alive && m.team !== target.team && this.cfg.dist(m.x, m.y, target.x, target.y) <= target.range + 20
      );
      if (!hasMinion) dmg *= 0.42;
    }

    // Armor mitigation
    const armor = target.stats ? target.stats.armor : target.type === 'tower' ? 45 : 12;
    const mitigation = 100 / (100 + armor * (dmgType === 'magic' ? 0.75 : 1.0));
    let finalDmg = Math.max(8, Math.round(dmg * mitigation));

    // Angela passive (咒术火焰) bonus burn on skill hits
    if (attacker && attacker.type === 'hero' && attacker.template.id === 'angela' && dmgType === 'magic') {
      finalDmg = Math.round(finalDmg * 1.08);
    }

    // Red Buff bonus burn + slow on hero attacks
    if (attacker && attacker.type === 'hero' && attacker.buffs.redBuff > 0 && dmgType === 'physical') {
      finalDmg += 22;
      if (target.type === 'hero' || target.type === 'minion') {
        target.slowTimer = Math.max(target.slowTimer || 0, 1.0);
        target.slowFactor = Math.max(target.slowFactor || 0, 0.2);
      }
    }

    // Shield absorption
    if (target.shield > 0) {
      const absorbed = Math.min(target.shield, finalDmg);
      target.shield -= absorbed;
      finalDmg -= absorbed;
    }

    target.hp -= finalDmg;
    target.flashTimer = 0.12;

    if (target.type === 'hero') {
      target.lastCombatTime = this.time;
      target.recalling = false;
      if (attacker && attacker.type === 'hero') {
        target.recentDamagers[attacker.id] = this.time;
        // Tower aggro switch! If enemy hero hurts allied hero inside allied tower range
        for (const t of [...this.map.towers, this.map.crystals[target.team]]) {
          if (
            t.alive &&
            t.team === target.team &&
            this.cfg.dist(attacker.x, attacker.y, t.x, t.y) <= t.range + 15
          ) {
            t.targetId = attacker.id;
          }
        }
      }
    }

    if (target.type === 'monster' && attacker) {
      target.aggroTargetId = attacker.id;
    }

    if (attacker && attacker.type === 'hero') {
      attacker.lastCombatTime = this.time;
      attacker.damageDealt += finalDmg;
      if (dmgType === 'physical' && attacker.stats.lifesteal > 0 && target.type !== 'tower') {
        attacker.hp = Math.min(attacker.stats.maxHp, attacker.hp + finalDmg * attacker.stats.lifesteal);
      }
    }

    // Floating damage text (show for player or nearby action)
    if (
      (attacker && attacker.isPlayer) ||
      target.isPlayer ||
      this.cfg.dist(this.player.x, this.player.y, target.x, target.y) < 520
    ) {
      const col = isCrit ? '#ffe066' : dmgType === 'magic' ? '#d094ff' : '#ffad66';
      this.spawnFloatingText(
        target.x + (Math.random() - 0.5) * 18,
        target.y - (target.radius || 18) - 8,
        isCrit ? `${finalDmg}!` : `${finalDmg}`,
        col,
        isCrit ? 16 : 12
      );
      if (attacker && attacker.isPlayer) MiniHoK.Audio.play('hit');
    }

    if (target.hp <= 0) {
      this.handleDeath(target, attacker);
    }
    return finalDmg;
  }

  handleDeath(victim, killer) {
    victim.hp = 0;
    victim.alive = false;
    this.spawnParticles(victim.x, victim.y, victim.team === 0 ? '#3ea6ff' : '#ff5656', 18);

    // 1. Hero killed
    if (victim.type === 'hero') {
      victim.deaths++;
      victim.killStreak = 0;
      victim.respawnTimer = Math.min(26, 6 + victim.level * 1.4);

      const killerTeam = killer && killer.team !== undefined ? killer.team : victim.team === 0 ? 1 : 0;
      if (killerTeam === 0 || killerTeam === 1) {
        this.scores[killerTeam]++;
      }

      // Resolve hero killer (or last hero damager if killed by tower/minion)
      let creditKiller = killer && killer.type === 'hero' ? killer : null;
      if (!creditKiller) {
        let latestT = -1;
        for (const [hid, t] of Object.entries(victim.recentDamagers)) {
          if (this.time - t <= 8 && t > latestT) {
            latestT = t;
            creditKiller = this.heroes.find((h) => h.id === hid) || null;
          }
        }
      }

      if (creditKiller) {
        creditKiller.kills++;
        creditKiller.killStreak++;
        creditKiller.multiKill = creditKiller.multiKillTimer > 0 ? creditKiller.multiKill + 1 : 1;
        creditKiller.multiKillTimer = 9.0;

        const bounty = 220 + Math.min(200, victim.level * 15);
        this.grantGold(creditKiller, bounty);
        this.grantXp(creditKiller, 160 + victim.level * 25);

        // Assists
        for (const [hid, t] of Object.entries(victim.recentDamagers)) {
          if (hid !== creditKiller.id && this.time - t <= 8) {
            const ally = this.heroes.find((h) => h.id === hid);
            if (ally && ally.team === creditKiller.team) {
              ally.assists++;
              this.grantGold(ally, 95);
              this.grantXp(ally, 75);
            }
          }
        }

        // Announcer & Kill feed
        if (!this.firstBloodTaken) {
          this.firstBloodTaken = true;
          this.announce('第一滴血！', `FIRST BLOOD · ${creditKiller.name}`);
        } else if (creditKiller.multiKill === 2) {
          this.announce('双杀！', `DOUBLE KILL · ${creditKiller.name}`);
        } else if (creditKiller.multiKill === 3) {
          this.announce('三杀！', `TRIPLE KILL · ${creditKiller.name}`);
        } else if (creditKiller.multiKill >= 4) {
          this.announce('超神连杀！', `UNSTOPPABLE · ${creditKiller.name}`);
        } else if (creditKiller.killStreak >= 3) {
          this.announce(`${creditKiller.name} 大杀特杀！`, 'KILLING SPREE');
        }

        this.pushKillFeed(creditKiller.name, creditKiller.team, victim.name, victim.team);
      } else {
        this.pushKillFeed(killer && killer.type === 'tower' ? '防御塔' : '小兵', killerTeam, victim.name, victim.team);
      }

      // Check Team Ace
      const enemyAlive = this.heroes.some((h) => h.team === victim.team && h.alive);
      if (!enemyAlive && this.mode.teamSize > 1) {
        this.announce('团灭！', 'ACE');
      }

      if (creditKiller && creditKiller.isPlayer) MiniHoK.Audio.play('kill');
      victim.recentDamagers = {};
      return;
    }

    // 2. Minion killed -> Gold & XP to killer + nearby enemy heroes
    if (victim.type === 'minion') {
      const killerHero = killer && killer.type === 'hero' ? killer : null;
      if (killerHero) {
        this.grantGold(killerHero, victim.goldValue);
        this.grantXp(killerHero, victim.xpValue);
      }
      for (const h of this.heroes) {
        if (!h.alive || h.team === victim.team) continue;
        if (killerHero && h.id === killerHero.id) continue;
        if (this.cfg.dist(h.x, h.y, victim.x, victim.y) <= 360) {
          this.grantGold(h, Math.round(victim.goldValue * 0.55));
          this.grantXp(h, Math.round(victim.xpValue * 0.75));
        }
      }
      return;
    }

    // 3. Jungle Monster killed
    if (victim.type === 'monster') {
      const killerHero = killer && killer.type === 'hero' ? killer : null;
      if (killerHero) {
        this.grantGold(killerHero, victim.goldValue);
        this.grantXp(killerHero, victim.xpValue);
        if (victim.kind === 'red') {
          killerHero.buffs.redBuff = 45;
          this.spawnFloatingText(killerHero.x, killerHero.y - 40, '获得红Buff!', '#ff6b6b');
        } else if (victim.kind === 'blue') {
          killerHero.buffs.blueBuff = 45;
          this.spawnFloatingText(killerHero.x, killerHero.y - 40, '获得蓝Buff!', '#4dabf7');
        } else if (victim.kind === 'tyrant') {
          for (const ally of this.heroes) {
            if (ally.team === killerHero.team) {
              this.grantGold(ally, 120);
              ally.buffs.tyrantBuff = 50;
            }
          }
          this.announce(`${killerHero.team === 0 ? '蓝方' : '红方'}击杀了暴君！`, '全队获得金币与攻击增益');
        }
      }
      return;
    }

    // 4. Tower destroyed
    if (victim.type === 'tower') {
      MiniHoK.Audio.play('towerDestroy');
      this.spawnRingEffect(victim.x, victim.y, 130, '#ffae42', 0.8);
      const winTeam = victim.team === 0 ? 1 : 0;
      for (const h of this.heroes) {
        if (h.team === winTeam) this.grantGold(h, 150);
      }
      this.announce(`${victim.team === 0 ? '蓝方' : '红方'}防御塔已被摧毁！`, 'TURRET DESTROYED');
      return;
    }

    // 5. Crystal destroyed -> Match End!
    if (victim.type === 'crystal') {
      this.ended = true;
      this.winner = victim.team === 0 ? 1 : 0;
      this.spawnRingEffect(victim.x, victim.y, 220, '#ffe066', 1.2);
      this.spawnParticles(victim.x, victim.y, '#ffe066', 45);
      MiniHoK.Audio.play(this.winner === this.cfg.TEAM_BLUE ? 'victory' : 'defeat');
      if (this.callbacks.onGameEnd) {
        this.callbacks.onGameEnd(this.winner);
      }
    }
  }

  grantGold(hero, amount) {
    hero.gold += amount;
    if (hero.isPlayer) {
      this.spawnFloatingText(hero.x, hero.y - 28, `+${amount}g`, '#ffd43b', 13);
      MiniHoK.Audio.play('gold');
    }
  }

  grantXp(hero, amount) {
    if (hero.level >= this.cfg.MAX_LEVEL) return;
    hero.xp += amount;
    while (hero.level < this.cfg.MAX_LEVEL && hero.xp >= this.cfg.xpForLevel(hero.level)) {
      const prevLevel = hero.level;
      hero.xp -= this.cfg.xpForLevel(hero.level);
      hero.level++;
      this.recalcStats(hero, false);
      hero.hp = Math.min(hero.stats.maxHp, hero.hp + 130);
      hero.mp = Math.min(hero.stats.maxMp, hero.mp + 65);
      this.spawnRingEffect(hero.x, hero.y, 58, '#b197fc', 0.55);
      if (hero.isPlayer) {
        const unlockedUlt = prevLevel < 4 && hero.level >= 4;
        this.spawnFloatingText(
          hero.x,
          hero.y - 46,
          unlockedUlt ? '升级 Lv.4! 大招已解锁!' : `升级 Lv.${hero.level}!`,
          unlockedUlt ? '#ffe066' : '#d0bfff',
          15
        );
        MiniHoK.Audio.play('levelup');
      }
    }
  }

  // ==================== VISIBILITY & HELPERS ====================
  getBushAt(x, y) {
    for (const b of this.map.bushes) {
      if (this.cfg.dist(x, y, b.x, b.y) <= b.radius) return b;
    }
    return null;
  }

  isVisibleToTeam(entity, viewerTeam) {
    if (entity.team === viewerTeam) return true;
    const bush = this.getBushAt(entity.x, entity.y);
    if (!bush) return true;
    if (entity.lastRevealTime && this.time - entity.lastRevealTime < 1.4) return true;

    // Visible if any allied hero or minion is inside the same bush or very close
    for (const h of this.heroes) {
      if (h.alive && h.team === viewerTeam) {
        if (this.cfg.dist(h.x, h.y, bush.x, bush.y) <= bush.radius + 35) return true;
      }
    }
    for (const m of this.minions) {
      if (m.alive && m.team === viewerTeam) {
        if (this.cfg.dist(m.x, m.y, entity.x, entity.y) <= 110) return true;
      }
    }
    return false;
  }

  getAllEnemyUnits(team) {
    const out = [];
    for (const h of this.heroes) if (h.alive && h.team !== team) out.push(h);
    for (const m of this.minions) if (m.alive && m.team !== team) out.push(m);
    for (const mon of this.monsters) if (mon.alive) out.push(mon);
    for (const t of this.map.towers) if (t.alive && t.team !== team) out.push(t);
    for (const c of this.map.crystals) if (c.alive && c.team !== team) out.push(c);
    return out;
  }

  forEachEnemyInRadius(team, cx, cy, radius, fn) {
    for (const u of this.getAllEnemyUnits(team)) {
      if (u.untargetable > 0) continue;
      if (this.cfg.dist(cx, cy, u.x, u.y) <= radius + (u.radius || 16)) {
        fn(u);
      }
    }
  }

  findUnitById(id) {
    for (const h of this.heroes) if (h.id === id) return h;
    for (const m of this.minions) if (m.id === id) return m;
    for (const mon of this.monsters) if (mon.id === id) return mon;
    for (const t of this.map.towers) if (t.id === id) return t;
    for (const c of this.map.crystals) if (c.id === id) return c;
    return null;
  }

  pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 0.001) return Math.hypot(px - x1, py - y1);
    const t = this.cfg.clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  // ==================== VFX & EVENTS ====================
  spawnRingEffect(x, y, maxRadius, color, life) {
    this.effects.push({ type: 'ring', x, y, maxRadius, color, life, maxLife: life });
  }

  spawnSlashEffect(x, y, angle, radius, color) {
    this.effects.push({ type: 'slash', x, y, angle, radius, color, life: 0.22, maxLife: 0.22 });
  }

  spawnFloatingText(x, y, text, color, size) {
    this.floatingTexts.push({ x, y, text, color: color || '#fff', size: size || 13, life: 0.85, maxLife: 0.85 });
  }

  spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 140;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 2.5 + Math.random() * 3.5,
        color,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
      });
    }
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].life -= dt;
      if (this.effects[i].life <= 0) this.effects.splice(i, 1);
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y -= 34 * dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
  }

  announce(title, sub) {
    if (this.callbacks.onAnnounce) this.callbacks.onAnnounce(title, sub);
  }

  pushKillFeed(killerName, killerTeam, victimName, victimTeam) {
    if (this.callbacks.onKillFeed) this.callbacks.onKillFeed(killerName, killerTeam, victimName, victimTeam);
  }
};
