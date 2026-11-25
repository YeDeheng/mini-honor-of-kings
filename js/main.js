window.MiniHoK = window.MiniHoK || {};

(function () {
  const canvas = document.getElementById('game-canvas');
  const minimapCanvas = document.getElementById('minimap-canvas');
  const renderer = new MiniHoK.Renderer(canvas, minimapCanvas);

  let game = null;
  let lastMode = '3v3';
  let lastHeroId = 'arthur';
  let lastTime = performance.now();

  const keys = {};
  let lastMouseMoveTime = 0;
  const input = {
    moveX: 0,
    moveY: 0,
    moveTarget: null,
    attackHeld: false,
    attackTargetId: null,
    mouseScreenX: window.innerWidth / 2,
    mouseScreenY: window.innerHeight / 2,
    aimX: 0,
    aimY: 0,
    useMouseAim: false,
  };

  let hoveredSkillIndex = null;

  const ui = new MiniHoK.UI({
    onStart(modeId, heroId) {
      startMatch(modeId, heroId);
    },
    onRestart() {
      startMatch(lastMode, lastHeroId);
    },
    onBackToMenu() {
      game = null;
      ui.showStartScreen();
    },
    onTogglePause() {
      if (!game || game.ended) return;
      game.paused = !game.paused;
      ui.setPaused(game.paused);
    },
    onToggleCamera() {
      renderer.camera.locked = !renderer.camera.locked;
      return renderer.camera.locked;
    },
    onToggleShop(force) {
      if (!game || game.ended) return;
      ui.toggleShop(game, force);
    },
    onBuyItem(itemId) {
      if (!game || !game.player) return;
      game.buyItem(game.player, itemId);
    },
    onSellItem(slotIndex) {
      if (!game || !game.player) return;
      game.sellItem(game.player, slotIndex);
    },
    onCastSkill(idx) {
      if (!game || game.paused || game.ended) return;
      const aim = getSkillAimPoint(idx);
      game.castSkill(game.player, idx, aim.x, aim.y);
    },
    onAttackButton(pressed) {
      input.attackHeld = pressed;
    },
    onCastFlash() {
      if (!game || game.paused || game.ended) return;
      const aim = getFlashAimPoint();
      game.castFlash(game.player, aim.x, aim.y);
    },
    onCastHeal() {
      if (!game || game.paused || game.ended) return;
      game.castHeal(game.player);
    },
    onRecall() {
      if (!game || game.paused || game.ended) return;
      game.startRecall(game.player);
    },
  });

  function startMatch(modeId, heroId) {
    lastMode = modeId;
    lastHeroId = heroId;
    input.moveTarget = null;
    input.attackHeld = false;
    input.attackTargetId = null;

    game = new MiniHoK.GameEngine(modeId, heroId, {
      onAnnounce: (title, sub) => ui.showAnnouncer(title, sub),
      onKillFeed: (kn, kt, vn, vt) => ui.addKillFeed(kn, kt, vn, vt),
      onGameEnd: (winner) => ui.showEndScreen(game, winner),
    });

    renderer.camera.locked = true;
    renderer.snapCameraTo(game.player.x, game.player.y, game.map);
    ui.enterGame(game);
    ui.showAnnouncer('欢迎来到王者峡谷', `${game.mode.name} · 全军出击！`);
  }

  function isMouseAimActive() {
    return lastMouseMoveTime > 0 && (performance.now() - lastMouseMoveTime) < 1800;
  }

  function getSkillAimPoint(skillIndex) {
    input.useMouseAim = isMouseAimActive();
    if (input.useMouseAim) {
      const world = renderer.screenToWorld(input.mouseScreenX, input.mouseScreenY);
      return { x: world.x, y: world.y };
    }
    const skill = game.player.template.skills[skillIndex];
    return game.getSmartAimPoint(game.player, skill ? skill.range : 320, false);
  }

  function getFlashAimPoint() {
    input.useMouseAim = isMouseAimActive();
    if (input.useMouseAim) {
      const world = renderer.screenToWorld(input.mouseScreenX, input.mouseScreenY);
      return { x: world.x, y: world.y };
    }
    return game.getSmartAimPoint(game.player, MiniHoK.Config.FLASH_RANGE, true);
  }

  // ==================== INPUT LISTENERS ====================
  window.addEventListener('resize', () => renderer.resize());

  window.addEventListener('keydown', (e) => {
    const code = e.code;
    keys[code] = true;

    // Start Screen keyboard navigation
    if (!game) {
      if (code === 'Enter') {
        e.preventDefault();
        MiniHoK.Audio.init();
        startMatch(ui.selectedMode, ui.selectedHeroId);
      } else if (code === 'ArrowLeft') {
        e.preventDefault();
        ui.selectHeroByOffset(-1);
      } else if (code === 'ArrowRight') {
        e.preventDefault();
        ui.selectHeroByOffset(1);
      }
      return;
    }

    if (game.ended) return;

    if (code === 'Escape') {
      if (ui.isShopOpen()) {
        ui.toggleShop(game, false);
      } else {
        game.paused = !game.paused;
        ui.setPaused(game.paused);
      }
      return;
    }

    if (code === 'Tab') {
      e.preventDefault();
      ui.setScoreboardVisible(true, game);
      return;
    }

    if (code === 'KeyP') {
      ui.toggleShop(game);
      return;
    }

    if (code === 'KeyM') {
      const muted = MiniHoK.Audio.toggleMute();
      document.getElementById('btn-sound').textContent = muted ? '🔇' : '🔊';
      return;
    }

    if (code === 'KeyY') {
      renderer.camera.locked = !renderer.camera.locked;
      document.getElementById('btn-camera').classList.toggle('active', renderer.camera.locked);
      return;
    }

    if (game.paused) return;

    MiniHoK.Audio.init();

    if (code === 'KeyJ' || code === 'Space') {
      if (code === 'Space') e.preventDefault();
      input.attackHeld = true;
    } else if (code === 'KeyU' || code === 'KeyQ' || code === 'Digit1') {
      const aim = getSkillAimPoint(0);
      game.castSkill(game.player, 0, aim.x, aim.y);
    } else if (code === 'KeyI' || code === 'KeyE' || code === 'Digit2') {
      const aim = getSkillAimPoint(1);
      game.castSkill(game.player, 1, aim.x, aim.y);
    } else if (code === 'KeyO' || code === 'KeyR' || code === 'Digit3') {
      const aim = getSkillAimPoint(2);
      game.castSkill(game.player, 2, aim.x, aim.y);
    } else if (code === 'KeyK' || code === 'KeyH') {
      game.castHeal(game.player);
    } else if (code === 'KeyL' || code === 'KeyF') {
      const aim = getFlashAimPoint();
      game.castFlash(game.player, aim.x, aim.y);
    } else if (code === 'KeyB') {
      game.startRecall(game.player);
    } else if (code === 'KeyG') {
      const recs = MiniHoK.Items.getRecommended(game.player, game.player.gold);
      if (recs.length > 0) game.buyItem(game.player, recs[0].id);
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if ((e.code === 'KeyJ' || e.code === 'Space') && !keys.KeyJ && !keys.Space) {
      input.attackHeld = false;
    }
    if (e.code === 'Tab') ui.setScoreboardVisible(false);
  });

  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    input.attackHeld = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (e.clientX !== input.mouseScreenX || e.clientY !== input.mouseScreenY) {
      input.mouseScreenX = e.clientX;
      input.mouseScreenY = e.clientY;
      lastMouseMoveTime = performance.now();
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    if (!game || game.paused || game.ended) return;
    MiniHoK.Audio.init();
    const world = renderer.screenToWorld(e.clientX, e.clientY);

    if (e.button === 0) {
      // Left-click: Basic attack
      input.attackHeld = true;
      // If clicking directly on an enemy unit, lock onto it
      const clickedEnemy = findEnemyNearPoint(world.x, world.y, 38);
      if (clickedEnemy) input.attackTargetId = clickedEnemy.id;
    } else if (e.button === 2) {
      // Right-click: MOBA move or attack enemy
      const clickedEnemy = findEnemyNearPoint(world.x, world.y, 40);
      if (clickedEnemy) {
        input.attackTargetId = clickedEnemy.id;
        input.moveTarget = null;
      } else {
        input.attackTargetId = null;
        input.moveTarget = { x: world.x, y: world.y };
        game.spawnRingEffect(world.x, world.y, 26, '#38d97c', 0.28);
      }
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0 && !keys.KeyJ && !keys.Space) {
      input.attackHeld = false;
    }
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Skill button hover shows targeting indicator on canvas
  for (let i = 0; i < 3; i++) {
    const btn = document.getElementById(`btn-skill-${i}`);
    btn.addEventListener('mouseenter', () => { hoveredSkillIndex = i; });
    btn.addEventListener('mouseleave', () => { hoveredSkillIndex = null; });
  }

  // Minimap click pans camera (or right-click sets move target)
  minimapCanvas.addEventListener('mousedown', (e) => {
    if (!game) return;
    const rect = minimapCanvas.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;
    const wx = rx * game.map.width;
    const wy = ry * game.map.height;
    if (e.button === 2) {
      input.moveTarget = { x: wx, y: wy };
      input.attackTargetId = null;
    } else {
      renderer.camera.locked = false;
      document.getElementById('btn-camera').classList.remove('active');
      renderer.snapCameraTo(wx, wy, game.map);
    }
  });
  minimapCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function findEnemyNearPoint(wx, wy, pad) {
    if (!game) return null;
    let best = null;
    let bestD = Infinity;
    for (const u of game.getAllEnemyUnits(game.player.team)) {
      if (u.untargetable > 0) continue;
      if (u.type === 'hero' && !game.isVisibleToTeam(u, game.player.team)) continue;
      const d = MiniHoK.Config.dist(wx, wy, u.x, u.y);
      if (d <= (u.radius || 20) + pad && d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  // ==================== MAIN ANIMATION LOOP ====================
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (game) {
      // Read WASD / Arrow movement
      input.moveX =
        (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      input.moveY =
        (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);

      input.useMouseAim = isMouseAimActive();
      const worldAim = renderer.screenToWorld(input.mouseScreenX, input.mouseScreenY);
      input.aimX = worldAim.x;
      input.aimY = worldAim.y;

      game.update(dt, input);
      renderer.updateCamera(game, dt);

      const aimPreview =
        hoveredSkillIndex !== null
          ? { skillIndex: hoveredSkillIndex, aimX: input.aimX, aimY: input.aimY }
          : null;

      renderer.render(game, aimPreview);
      ui.updateHUD(game);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
