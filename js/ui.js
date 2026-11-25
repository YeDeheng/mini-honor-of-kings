window.MiniHoK = window.MiniHoK || {};

MiniHoK.UI = class UI {
  constructor(handlers) {
    this.handlers = handlers || {};
    this.selectedMode = '3v3';
    this.selectedHeroId = 'arthur';
    this.announcerTimeout = null;
    this.lastQuickBuyKey = '';

    this.el = {
      startScreen: document.getElementById('start-screen'),
      modeButtons: document.getElementById('mode-buttons'),
      heroGrid: document.getElementById('hero-grid'),
      heroPreview: document.getElementById('hero-preview'),
      btnStart: document.getElementById('btn-start-game'),

      hud: document.getElementById('hud'),
      minimapModeLabel: document.getElementById('minimap-mode-label'),
      scoreBlue: document.getElementById('score-blue'),
      scoreRed: document.getElementById('score-red'),
      matchTimer: document.getElementById('match-timer'),
      hudKda: document.getElementById('hud-kda'),
      hudGold: document.getElementById('hud-gold'),
      killFeed: document.getElementById('kill-feed'),
      announcer: document.getElementById('announcer'),
      announcerTitle: document.getElementById('announcer-title'),
      announcerSub: document.getElementById('announcer-sub'),
      quickBuyList: document.getElementById('quick-buy-list'),
      respawnBanner: document.getElementById('respawn-banner'),
      respawnSeconds: document.getElementById('respawn-seconds'),
      recallBar: document.getElementById('recall-bar'),
      recallFill: document.getElementById('recall-fill'),

      heroIcon: document.getElementById('hud-hero-icon'),
      heroLevel: document.getElementById('hud-level'),
      heroName: document.getElementById('hud-hero-name'),
      statsMini: document.getElementById('hud-stats-mini'),
      hpFill: document.getElementById('hud-hp-fill'),
      hpText: document.getElementById('hud-hp-text'),
      mpFill: document.getElementById('hud-mp-fill'),
      mpText: document.getElementById('hud-mp-text'),
      xpFill: document.getElementById('hud-xp-fill'),
      itemSlots: document.getElementById('hud-item-slots'),

      btnSound: document.getElementById('btn-sound'),
      btnCamera: document.getElementById('btn-camera'),
      btnFullscreen: document.getElementById('btn-fullscreen'),
      btnPause: document.getElementById('btn-pause'),
      btnScoreboard: document.getElementById('btn-scoreboard'),
      btnCloseScoreboard: document.getElementById('btn-close-scoreboard'),
      btnOpenShop: document.getElementById('btn-open-shop'),
      btnCloseShop: document.getElementById('btn-close-shop'),
      shopModal: document.getElementById('shop-modal'),
      shopGold: document.getElementById('shop-gold'),
      shopOwnedSlots: document.getElementById('shop-owned-slots'),
      shopGrid: document.getElementById('shop-grid'),

      rotateHint: document.getElementById('rotate-hint'),
      btnDismissRotate: document.getElementById('btn-dismiss-rotate'),

      scoreboardModal: document.getElementById('scoreboard-modal'),
      scoreboardTime: document.getElementById('scoreboard-time'),
      scoreboardBlue: document.getElementById('scoreboard-blue'),
      scoreboardRed: document.getElementById('scoreboard-red'),

      pauseModal: document.getElementById('pause-modal'),
      btnResume: document.getElementById('btn-resume'),
      btnRestart: document.getElementById('btn-restart'),
      btnBackMenu: document.getElementById('btn-back-menu'),

      endScreen: document.getElementById('end-screen'),
      endBanner: document.getElementById('end-banner'),
      endTitle: document.getElementById('end-title'),
      endSummary: document.getElementById('end-summary'),
      endStats: document.getElementById('end-stats'),
      btnPlayAgain: document.getElementById('btn-play-again'),
      btnEndMenu: document.getElementById('btn-end-menu'),
    };

    this.initStartScreen();
    this.bindButtons();
  }

  initStartScreen() {
    // Mode buttons
    this.el.modeButtons.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.el.modeButtons.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMode = btn.dataset.mode;
      });
    });

    // Hero cards
    this.el.heroGrid.innerHTML = '';
    MiniHoK.Heroes.LIST.forEach((h) => {
      const card = document.createElement('div');
      card.className = 'hero-card' + (h.id === this.selectedHeroId ? ' selected' : '');
      card.dataset.id = h.id;
      card.innerHTML = `
        <div class="hero-card-avatar" style="background: radial-gradient(circle, ${h.color}55, #121c30)">${h.icon}</div>
        <div class="hero-card-name">${h.name}</div>
        <div class="hero-card-role">${h.roleLabel}</div>
      `;
      card.addEventListener('click', () => {
        this.selectedHeroId = h.id;
        this.el.heroGrid.querySelectorAll('.hero-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        this.renderHeroPreview(h);
      });
      this.el.heroGrid.appendChild(card);
    });

    this.renderHeroPreview(MiniHoK.Heroes.getById(this.selectedHeroId));
  }

  selectHeroByOffset(delta) {
    const list = MiniHoK.Heroes.LIST;
    if (!list || list.length === 0) return;
    const curIdx = list.findIndex((h) => h.id === this.selectedHeroId);
    const nextIdx = ((curIdx === -1 ? 0 : curIdx) + (delta % list.length) + list.length) % list.length;
    const hero = list[nextIdx];
    this.selectedHeroId = hero.id;
    this.el.heroGrid.querySelectorAll('.hero-card').forEach((c) => {
      c.classList.toggle('selected', c.dataset.id === hero.id);
    });
    this.renderHeroPreview(hero);
  }

  renderHeroPreview(h) {
    const keyHints = ['U / Q', 'I / E', 'O / R'];
    const skillsHtml = h.skills
      .map(
        (s, idx) => `
      <div class="preview-skill-box">
        <strong>[${keyHints[idx]}] ${s.icon} ${s.name}（CD ${s.cd}s）</strong>
        <p>${s.desc}</p>
      </div>`
      )
      .join('');

    this.el.heroPreview.innerHTML = `
      <div class="preview-header">
        <div class="preview-title">${h.icon} ${h.name} · <span style="color:var(--gold)">${h.roleLabel}</span></div>
        <div class="preview-passive">被动 · ${h.passive.name}：${h.passive.desc}</div>
      </div>
      <div class="preview-skills">${skillsHtml}</div>
    `;
  }

  bindButtons() {
    this.el.btnStart.addEventListener('click', () => {
      MiniHoK.Audio.init();
      if (this.handlers.onStart) this.handlers.onStart(this.selectedMode, this.selectedHeroId);
    });

    this.el.btnSound.addEventListener('click', () => {
      const muted = MiniHoK.Audio.toggleMute();
      this.el.btnSound.textContent = muted ? '🔇' : '🔊';
    });

    this.el.btnCamera.addEventListener('click', () => {
      if (this.handlers.onToggleCamera) {
        const locked = this.handlers.onToggleCamera();
        this.el.btnCamera.classList.toggle('active', locked);
      }
    });

    if (this.el.btnFullscreen) {
      const updateFsBtn = () => {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        this.el.btnFullscreen.classList.toggle('active', isFs);
      };
      this.el.btnFullscreen.addEventListener('click', () => {
        const docEl = document.documentElement;
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        try {
          if (!isFs) {
            const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
            if (req) {
              const p = req.call(docEl);
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          } else {
            const exit = document.exitFullscreen || document.webkitExitFullscreen;
            if (exit) {
              const p = exit.call(document);
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          }
        } catch (err) {
          // Graceful fallback when fullscreen API is unavailable
        }
      });
      document.addEventListener('fullscreenchange', updateFsBtn);
      document.addEventListener('webkitfullscreenchange', updateFsBtn);
    }

    if (this.el.btnScoreboard) {
      this.el.btnScoreboard.addEventListener('click', () => {
        if (this.handlers.onToggleScoreboard) this.handlers.onToggleScoreboard();
      });
    }
    if (this.el.btnCloseScoreboard) {
      this.el.btnCloseScoreboard.addEventListener('click', () => {
        if (this.handlers.onToggleScoreboard) this.handlers.onToggleScoreboard(false);
      });
    }
    if (this.el.scoreboardModal) {
      this.el.scoreboardModal.addEventListener('click', (e) => {
        if (e.target === this.el.scoreboardModal && this.handlers.onToggleScoreboard) {
          this.handlers.onToggleScoreboard(false);
        }
      });
    }
    if (this.el.shopModal) {
      this.el.shopModal.addEventListener('click', (e) => {
        if (e.target === this.el.shopModal && this.handlers.onToggleShop) {
          this.handlers.onToggleShop(false);
        }
      });
    }
    if (this.el.rotateHint) {
      const dismissRotate = () => this.el.rotateHint.classList.add('dismissed');
      if (this.el.btnDismissRotate) {
        this.el.btnDismissRotate.addEventListener('click', (e) => {
          e.stopPropagation();
          dismissRotate();
        });
      }
      this.el.rotateHint.addEventListener('click', dismissRotate);
    }

    this.el.btnPause.addEventListener('click', () => this.handlers.onTogglePause && this.handlers.onTogglePause());
    this.el.btnResume.addEventListener('click', () => this.handlers.onTogglePause && this.handlers.onTogglePause());
    this.el.btnRestart.addEventListener('click', () => this.handlers.onRestart && this.handlers.onRestart());
    this.el.btnBackMenu.addEventListener('click', () => this.handlers.onBackToMenu && this.handlers.onBackToMenu());
    this.el.btnPlayAgain.addEventListener('click', () => this.handlers.onRestart && this.handlers.onRestart());
    this.el.btnEndMenu.addEventListener('click', () => this.handlers.onBackToMenu && this.handlers.onBackToMenu());

    this.el.btnOpenShop.addEventListener('click', () => this.handlers.onToggleShop && this.handlers.onToggleShop());
    this.el.btnCloseShop.addEventListener('click', () => this.handlers.onToggleShop && this.handlers.onToggleShop(false));

    // HUD skill/attack buttons
    for (let i = 0; i < 3; i++) {
      const btn = document.getElementById(`btn-skill-${i}`);
      btn.addEventListener('click', () => this.handlers.onCastSkill && this.handlers.onCastSkill(i));
    }
    document.getElementById('btn-attack').addEventListener('mousedown', () => this.handlers.onAttackButton && this.handlers.onAttackButton(true));
    document.getElementById('btn-attack').addEventListener('mouseup', () => this.handlers.onAttackButton && this.handlers.onAttackButton(false));
    document.getElementById('btn-attack').addEventListener('mouseleave', () => this.handlers.onAttackButton && this.handlers.onAttackButton(false));

    document.getElementById('btn-flash').addEventListener('click', () => this.handlers.onCastFlash && this.handlers.onCastFlash());
    document.getElementById('btn-heal').addEventListener('click', () => this.handlers.onCastHeal && this.handlers.onCastHeal());
    document.getElementById('btn-recall').addEventListener('click', () => this.handlers.onRecall && this.handlers.onRecall());
  }

  enterGame(game) {
    this.el.startScreen.classList.add('hidden');
    this.el.pauseModal.classList.add('hidden');
    this.el.endScreen.classList.add('hidden');
    this.el.shopModal.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.killFeed.innerHTML = '';
    this.el.minimapModeLabel.textContent = game.modeId.toUpperCase();
    this.lastQuickBuyKey = '';

    const p = game.player;
    this.el.heroIcon.textContent = p.template.icon;
    this.el.heroName.textContent = p.template.shortName;
    p.template.skills.forEach((s, i) => {
      document.getElementById(`icon-skill-${i}`).textContent = s.icon;
      document.getElementById(`name-skill-${i}`).textContent = s.name;
      document.getElementById(`btn-skill-${i}`).title = `[${s.key}] ${s.name}：${s.desc}`;
    });
  }

  showStartScreen() {
    this.el.hud.classList.add('hidden');
    this.el.pauseModal.classList.add('hidden');
    this.el.endScreen.classList.add('hidden');
    this.el.shopModal.classList.add('hidden');
    this.el.scoreboardModal.classList.add('hidden');
    this.el.startScreen.classList.remove('hidden');
  }

  setPaused(paused) {
    this.el.pauseModal.classList.toggle('hidden', !paused);
  }

  setScoreboardVisible(visible, game) {
    this.el.scoreboardModal.classList.toggle('hidden', !visible);
    if (visible && game) this.renderScoreboard(game);
  }

  isScoreboardOpen() {
    return !this.el.scoreboardModal.classList.contains('hidden');
  }

  toggleShop(game, forceState) {
    const isHidden = this.el.shopModal.classList.contains('hidden');
    const shouldOpen = forceState !== undefined ? forceState : isHidden;
    this.el.shopModal.classList.toggle('hidden', !shouldOpen);
    if (shouldOpen && game) this.renderShop(game);
    return shouldOpen;
  }

  isShopOpen() {
    return !this.el.shopModal.classList.contains('hidden');
  }

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  updateHUD(game) {
    const p = game.player;
    if (!p) return;

    this.el.scoreBlue.textContent = game.scores[0];
    this.el.scoreRed.textContent = game.scores[1];
    this.el.matchTimer.textContent = this.formatTime(game.time);
    this.el.hudKda.textContent = `${p.kills}/${p.deaths}/${p.assists}`;
    this.el.hudGold.textContent = Math.floor(p.gold);

    this.el.heroLevel.textContent = p.level;
    this.el.statsMini.textContent = `攻 ${p.stats.ad} · 法 ${p.stats.ap} · 防 ${p.stats.armor}`;

    const hpPct = (p.hp / p.stats.maxHp) * 100;
    const mpPct = (p.mp / p.stats.maxMp) * 100;
    const xpPct = p.level >= MiniHoK.Config.MAX_LEVEL ? 100 : (p.xp / MiniHoK.Config.xpForLevel(p.level)) * 100;

    this.el.hpFill.style.width = `${Math.max(0, Math.min(100, hpPct))}%`;
    this.el.hpText.textContent = `${Math.ceil(p.hp)} / ${p.stats.maxHp}`;
    this.el.mpFill.style.width = `${Math.max(0, Math.min(100, mpPct))}%`;
    this.el.mpText.textContent = `${Math.floor(p.mp)} / ${p.stats.maxMp}`;
    this.el.xpFill.style.width = `${Math.max(0, Math.min(100, xpPct))}%`;

    // Skill buttons cooldowns
    for (let i = 0; i < 3; i++) {
      const btn = document.getElementById(`btn-skill-${i}`);
      const cdEl = document.getElementById(`cd-skill-${i}`);
      const cd = p.skillCds[i];
      const skill = p.template.skills[i];
      const locked = i === 2 && p.level < 4;
      const onCd = cd > 0.05;
      btn.classList.toggle('on-cd', locked || onCd);
      btn.classList.toggle('no-mana', !locked && !onCd && p.mp < skill.mana);
      cdEl.classList.toggle('visible', locked || onCd);
      if (locked) {
        cdEl.textContent = '4级';
      } else if (onCd) {
        cdEl.textContent = cd >= 1 ? Math.ceil(cd) : cd.toFixed(1);
      }
    }

    // Summoner spells CD
    this.updateSpellButton('btn-flash', 'cd-flash', p.summonerCds.flash);
    this.updateSpellButton('btn-heal', 'cd-heal', p.summonerCds.heal);

    // Respawn banner
    if (!p.alive) {
      this.el.respawnBanner.classList.remove('hidden');
      this.el.respawnSeconds.textContent = Math.max(1, Math.ceil(p.respawnTimer));
    } else {
      this.el.respawnBanner.classList.add('hidden');
    }

    // Recall bar
    if (p.recalling && p.alive) {
      this.el.recallBar.classList.remove('hidden');
      this.el.recallFill.style.width = `${Math.min(100, (p.recallTimer / MiniHoK.Config.RECALL_TIME) * 100)}%`;
    } else {
      this.el.recallBar.classList.add('hidden');
    }

    // Item slots (bottom HUD)
    let slotsHtml = '';
    for (let i = 0; i < MiniHoK.Config.MAX_ITEMS; i++) {
      const it = p.items[i] ? MiniHoK.Items.getById(p.items[i]) : null;
      slotsHtml += `<div class="item-slot ${it ? 'filled' : ''}" title="${it ? it.name + '：' + it.desc : '空装备槽'}">${it ? it.icon : ''}</div>`;
    }
    this.el.itemSlots.innerHTML = slotsHtml;

    // Quick-buy recommendations
    const recs = MiniHoK.Items.getRecommended(p, p.gold);
    const qbKey = recs.map((r) => r.id).join(',') + '|' + p.items.length;
    if (qbKey !== this.lastQuickBuyKey) {
      this.lastQuickBuyKey = qbKey;
      this.el.quickBuyList.innerHTML = '';
      recs.forEach((it, idx) => {
        const div = document.createElement('div');
        div.className = 'quick-buy-item';
        div.innerHTML = `
          <span class="quick-buy-icon">${it.icon}</span>
          <div class="quick-buy-info">
            <strong>${idx === 0 ? '[G] ' : ''}购买 ${it.name}</strong>
            <small>🪙 ${it.price} · ${it.desc.split('·')[0].trim()}</small>
          </div>
        `;
        div.addEventListener('click', () => {
          if (this.handlers.onBuyItem) this.handlers.onBuyItem(it.id);
        });
        this.el.quickBuyList.appendChild(div);
      });
    }

    if (this.isShopOpen()) {
      this.el.shopGold.textContent = Math.floor(p.gold);
    }
  }

  updateSpellButton(btnId, cdId, cd) {
    const btn = document.getElementById(btnId);
    const cdEl = document.getElementById(cdId);
    const onCd = cd > 0.05;
    btn.classList.toggle('on-cd', onCd);
    cdEl.classList.toggle('visible', onCd);
    if (onCd) cdEl.textContent = Math.ceil(cd);
  }

  renderShop(game) {
    const p = game.player;
    this.el.shopGold.textContent = Math.floor(p.gold);

    this.el.shopOwnedSlots.innerHTML = '';
    if (p.items.length === 0) {
      this.el.shopOwnedSlots.innerHTML = '<span style="font-size:12px;color:var(--text-muted)">暂无装备</span>';
    } else {
      p.items.forEach((id, idx) => {
        const it = MiniHoK.Items.getById(id);
        if (!it) return;
        const chip = document.createElement('div');
        chip.className = 'owned-item-chip';
        chip.title = `点击以 ${Math.round(it.price * 0.7)} 金币出售`;
        chip.innerHTML = `${it.icon} ${it.name} <span style="color:#ff8585">×</span>`;
        chip.addEventListener('click', () => {
          if (this.handlers.onSellItem) {
            this.handlers.onSellItem(idx);
            this.renderShop(game);
          }
        });
        this.el.shopOwnedSlots.appendChild(chip);
      });
    }

    this.el.shopGrid.innerHTML = '';
    MiniHoK.Items.LIST.forEach((it) => {
      const canBuy = p.gold >= it.price && p.items.length < MiniHoK.Config.MAX_ITEMS;
      const card = document.createElement('div');
      card.className = `shop-item-card ${canBuy ? 'affordable' : 'unaffordable'}`;
      card.innerHTML = `
        <div class="shop-item-left">
          <span class="shop-item-icon">${it.icon}</span>
          <div>
            <div class="shop-item-name">${it.name}</div>
            <div class="shop-item-desc">${it.desc}</div>
          </div>
        </div>
        <div class="shop-item-price">🪙 ${it.price}</div>
      `;
      if (canBuy) {
        card.addEventListener('click', () => {
          if (this.handlers.onBuyItem) {
            this.handlers.onBuyItem(it.id);
            this.renderShop(game);
          }
        });
      }
      this.el.shopGrid.appendChild(card);
    });
  }

  renderScoreboard(game) {
    this.el.scoreboardTime.textContent = this.formatTime(game.time);
    const buildRows = (team) =>
      game.heroes
        .filter((h) => h.team === team)
        .map(
          (h) => `
        <div class="sb-row ${h.isPlayer ? 'is-player' : ''}">
          <div class="sb-hero">
            <span>${h.template.icon}</span>
            <strong>${h.name}</strong>
            <small style="color:var(--text-muted)">Lv.${h.level}</small>
          </div>
          <div class="sb-kda">${h.kills} / ${h.deaths} / ${h.assists}</div>
          <div class="sb-gold">🪙 ${Math.floor(h.gold)}</div>
        </div>`
        )
        .join('');

    this.el.scoreboardBlue.innerHTML = buildRows(0);
    this.el.scoreboardRed.innerHTML = buildRows(1);
  }

  showAnnouncer(title, sub) {
    this.el.announcerTitle.textContent = title;
    this.el.announcerSub.textContent = sub || '';
    this.el.announcer.classList.remove('hidden');
    clearTimeout(this.announcerTimeout);
    this.announcerTimeout = setTimeout(() => {
      this.el.announcer.classList.add('hidden');
    }, 2800);
  }

  addKillFeed(killerName, killerTeam, victimName, victimTeam) {
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.innerHTML = `
      <span class="${killerTeam === 0 ? 'blue-name' : 'red-name'}">${killerName}</span>
      <span>⚔️ 击杀</span>
      <span class="${victimTeam === 0 ? 'blue-name' : 'red-name'}">${victimName}</span>
    `;
    this.el.killFeed.prepend(entry);
    while (this.el.killFeed.children.length > 5) {
      this.el.killFeed.lastChild.remove();
    }
    setTimeout(() => entry.remove(), 7000);
  }

  showEndScreen(game, winnerTeam) {
    const isVictory = winnerTeam === MiniHoK.Config.TEAM_BLUE;
    this.el.endBanner.textContent = isVictory ? 'VICTORY' : 'DEFEAT';
    this.el.endBanner.className = `end-banner ${isVictory ? 'victory' : 'defeat'}`;
    this.el.endTitle.textContent = isVictory ? '胜利！敌方水晶已被摧毁' : '惜败！我方水晶已被摧毁';
    this.el.endSummary.textContent = `模式：${game.mode.name} · 时长：${this.formatTime(game.time)} · 比分：${game.scores[0]} : ${game.scores[1]}`;

    // Sort all heroes by MVP score
    const sorted = [...game.heroes].sort(
      (a, b) => b.kills * 3 + b.assists * 1.5 - b.deaths * 1.5 - (a.kills * 3 + a.assists * 1.5 - a.deaths * 1.5)
    );
    const mvpId = sorted[0] ? sorted[0].id : null;

    this.el.endStats.innerHTML = sorted
      .map(
        (h) => `
      <div class="sb-row ${h.isPlayer ? 'is-player' : ''}">
        <div class="sb-hero">
          <span>${h.template.icon}</span>
          <strong style="color:${h.team === 0 ? 'var(--blue)' : 'var(--red)'}">${h.name}</strong>
          ${h.id === mvpId ? '<span style="color:var(--gold-bright);font-weight:800;font-size:11px">👑 MVP</span>' : ''}
        </div>
        <div class="sb-kda">${h.kills}/${h.deaths}/${h.assists}</div>
        <div class="sb-gold">输出 ${Math.round(h.damageDealt)}</div>
      </div>`
      )
      .join('');

    this.el.endScreen.classList.remove('hidden');
  }
};
