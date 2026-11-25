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

  // ==================== TOUCH CAPABILITY & STATE ====================
  const hasCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (hasCoarsePointer || 'ontouchstart' in window || navigator.maxTouchPoints > 0) {
    document.body.classList.add('touch-device');
  }
  window.addEventListener(
    'touchstart',
    () => {
      if (!document.body.classList.contains('touch-device')) {
        document.body.classList.add('touch-device');
      }
    },
    { passive: true }
  );

  const joystick = {
    touchId: null,
    originX: 0,
    originY: 0,
    moveX: 0,
    moveY: 0,
    deadzone: 8,
    maxRadius: 48,
  };
  let attackTouchId = null;
  let touchAimSkill = null;

  const joystickZone = document.getElementById('joystick-zone');
  const joystickBase = document.getElementById('joystick-base');
  const joystickKnob = document.getElementById('joystick-knob');
  const attackBtn = document.getElementById('btn-attack');

  function resetJoystick() {
    joystick.touchId = null;
    joystick.moveX = 0;
    joystick.moveY = 0;
    if (joystickBase) {
      joystickBase.classList.remove('active');
      joystickBase.style.left = '';
      joystickBase.style.top = '';
    }
    if (joystickKnob) {
      joystickKnob.style.transform = '';
    }
  }

  function resetTouchControls() {
    resetJoystick();
    attackTouchId = null;
    if (attackBtn) attackBtn.classList.remove('pressed');
    if (touchAimSkill && touchAimSkill.btn) {
      touchAimSkill.btn.classList.remove('aiming');
    }
    touchAimSkill = null;
  }

  const ui = new MiniHoK.UI({
    onStart(modeId, heroId) {
      startMatch(modeId, heroId);
    },
    onRestart() {
      startMatch(lastMode, lastHeroId);
    },
    onBackToMenu() {
      resetTouchControls();
      game = null;
      ui.showStartScreen();
    },
    onTogglePause() {
      if (!game || game.ended) return;
      game.paused = !game.paused;
      if (game.paused) {
        resetTouchControls();
        input.attackHeld = false;
      }
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
    onToggleScoreboard(force) {
      if (!game || game.ended) return;
      const shouldShow = force !== undefined ? force : !ui.isScoreboardOpen();
      ui.setScoreboardVisible(shouldShow, game);
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
    resetTouchControls();

    game = new MiniHoK.GameEngine(modeId, heroId, {
      onAnnounce: (title, sub) => ui.showAnnouncer(title, sub),
      onKillFeed: (kn, kt, vn, vt) => ui.addKillFeed(kn, kt, vn, vt),
      onGameEnd: (winner) => {
        resetTouchControls();
        input.attackHeld = false;
        ui.showEndScreen(game, winner);
      },
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
  window.addEventListener('orientationchange', () => {
    setTimeout(() => renderer.resize(), 120);
  });

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
    resetTouchControls();
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
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  // Skill button hover shows targeting indicator on canvas
  for (let i = 0; i < 3; i++) {
    const btn = document.getElementById(`btn-skill-${i}`);
    btn.addEventListener('mouseenter', () => { hoveredSkillIndex = i; });
    btn.addEventListener('mouseleave', () => { hoveredSkillIndex = null; });
  }

  // ==================== MULTI-TOUCH MOBILE CONTROLS ====================
  function findTouchById(touchList, id) {
    for (let i = 0; i < touchList.length; i++) {
      if (touchList[i].identifier === id) return touchList[i];
    }
    return null;
  }

  function computeTouchSkillAim(state) {
    const player = game.player;
    const skill = player.template.skills[state.skillIndex];
    const maxRange = skill ? skill.range : 320;
    const dist = Math.hypot(state.dx, state.dy);
    if (!state.dragged || dist < 1) {
      return game.getSmartAimPoint(player, maxRange, false);
    }
    const clampedRange = Math.min(maxRange, 600);
    const dragRadius = 72;
    const ratio = MiniHoK.Config.clamp(dist / dragRadius, 0.25, 1.0);
    return {
      x: player.x + (state.dx / dist) * clampedRange * ratio,
      y: player.y + (state.dy / dist) * clampedRange * ratio,
    };
  }

  // 1. Left-Thumb Floating Virtual Joystick
  if (joystickZone && joystickBase && joystickKnob) {
    joystickZone.addEventListener(
      'touchstart',
      (e) => {
        if (!game || game.paused || game.ended) return;
        if (joystick.touchId !== null) return;
        e.preventDefault();
        MiniHoK.Audio.init();
        const t = e.changedTouches[0];
        if (!t) return;

        const rect = joystickZone.getBoundingClientRect();
        const baseHalf = (joystickBase.offsetWidth || 116) / 2;
        const cx = MiniHoK.Config.clamp(t.clientX - rect.left, baseHalf, Math.max(baseHalf, rect.width - baseHalf));
        const cy = MiniHoK.Config.clamp(t.clientY - rect.top, baseHalf, Math.max(baseHalf, rect.height - baseHalf));

        joystick.touchId = t.identifier;
        joystick.originX = rect.left + cx;
        joystick.originY = rect.top + cy;
        joystick.moveX = 0;
        joystick.moveY = 0;

        joystickBase.style.left = `${cx}px`;
        joystickBase.style.top = `${cy}px`;
        joystickBase.classList.add('active');
        joystickKnob.style.transform = 'translate3d(0, 0, 0)';
      },
      { passive: false }
    );

    joystickZone.addEventListener(
      'touchmove',
      (e) => {
        if (joystick.touchId === null) return;
        const t = findTouchById(e.changedTouches, joystick.touchId);
        if (!t) return;
        e.preventDefault();

        const dx = t.clientX - joystick.originX;
        const dy = t.clientY - joystick.originY;
        const dist = Math.hypot(dx, dy);

        if (dist <= joystick.deadzone) {
          joystick.moveX = 0;
          joystick.moveY = 0;
          joystickKnob.style.transform = 'translate3d(0, 0, 0)';
        } else {
          const clamped = Math.min(dist, joystick.maxRadius);
          const nx = dx / dist;
          const ny = dy / dist;
          const mag = (clamped - joystick.deadzone) / (joystick.maxRadius - joystick.deadzone);
          joystick.moveX = nx * mag;
          joystick.moveY = ny * mag;
          joystickKnob.style.transform = `translate3d(${(nx * clamped).toFixed(1)}px, ${(ny * clamped).toFixed(1)}px, 0)`;
        }
      },
      { passive: false }
    );

    const endJoystickTouch = (e) => {
      if (joystick.touchId === null) return;
      const t = findTouchById(e.changedTouches, joystick.touchId);
      if (!t) return;
      e.preventDefault();
      resetJoystick();
    };
    joystickZone.addEventListener('touchend', endJoystickTouch, { passive: false });
    joystickZone.addEventListener('touchcancel', endJoystickTouch, { passive: false });
  }

  // 2. Right-Thumb Basic Attack Button (Multi-Touch)
  if (attackBtn) {
    attackBtn.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        MiniHoK.Audio.init();
        if (!game || game.paused || game.ended) return;
        if (attackTouchId !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;
        attackTouchId = t.identifier;
        input.attackHeld = true;
        attackBtn.classList.add('pressed');
      },
      { passive: false }
    );

    const endAttackTouch = (e) => {
      if (attackTouchId === null) return;
      const t = findTouchById(e.changedTouches, attackTouchId);
      if (!t) return;
      e.preventDefault();
      attackTouchId = null;
      if (!keys.KeyJ && !keys.Space) {
        input.attackHeld = false;
      }
      attackBtn.classList.remove('pressed');
    };
    attackBtn.addEventListener('touchend', endAttackTouch, { passive: false });
    attackBtn.addEventListener('touchcancel', endAttackTouch, { passive: false });
  }

  // 3. Right-Thumb Skill Buttons (Tap Auto-Aim OR Hold-Drag-Aim)
  for (let i = 0; i < 3; i++) {
    const btn = document.getElementById(`btn-skill-${i}`);
    if (!btn) continue;

    btn.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        MiniHoK.Audio.init();
        if (!game || game.paused || game.ended || !game.player || !game.player.alive) return;
        if (touchAimSkill !== null) return;
        const t = e.changedTouches[0];
        if (!t) return;

        btn.classList.add('aiming');
        touchAimSkill = {
          skillIndex: i,
          touchId: t.identifier,
          startX: t.clientX,
          startY: t.clientY,
          dx: 0,
          dy: 0,
          dragged: false,
          btn,
        };
      },
      { passive: false }
    );

    btn.addEventListener(
      'touchmove',
      (e) => {
        if (!touchAimSkill || touchAimSkill.skillIndex !== i) return;
        const t = findTouchById(e.changedTouches, touchAimSkill.touchId);
        if (!t) return;
        e.preventDefault();

        touchAimSkill.dx = t.clientX - touchAimSkill.startX;
        touchAimSkill.dy = t.clientY - touchAimSkill.startY;
        if (Math.hypot(touchAimSkill.dx, touchAimSkill.dy) > 16) {
          touchAimSkill.dragged = true;
        }
      },
      { passive: false }
    );

    btn.addEventListener(
      'touchend',
      (e) => {
        if (!touchAimSkill || touchAimSkill.skillIndex !== i) return;
        const t = findTouchById(e.changedTouches, touchAimSkill.touchId);
        if (!t) return;
        e.preventDefault();

        const state = touchAimSkill;
        btn.classList.remove('aiming');
        touchAimSkill = null;

        if (game && !game.paused && !game.ended && game.player && game.player.alive) {
          const skill = game.player.template.skills[i];
          const aim = state.dragged
            ? computeTouchSkillAim(state)
            : game.getSmartAimPoint(game.player, skill ? skill.range : 320, false);
          game.castSkill(game.player, i, aim.x, aim.y);
        }
      },
      { passive: false }
    );

    btn.addEventListener(
      'touchcancel',
      (e) => {
        if (!touchAimSkill || touchAimSkill.skillIndex !== i) return;
        const t = findTouchById(e.changedTouches, touchAimSkill.touchId);
        if (!t) return;
        e.preventDefault();
        btn.classList.remove('aiming');
        touchAimSkill = null;
      },
      { passive: false }
    );
  }

  // 4. Summoner Spells Touch Support
  function bindSummonerTouch(id, action) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        MiniHoK.Audio.init();
        btn.classList.add('pressed');
        if (!game || game.paused || game.ended || !game.player) return;
        action();
      },
      { passive: false }
    );
    const clearPressed = () => btn.classList.remove('pressed');
    btn.addEventListener('touchend', clearPressed, { passive: true });
    btn.addEventListener('touchcancel', clearPressed, { passive: true });
  }

  bindSummonerTouch('btn-flash', () => {
    if (joystick.moveX !== 0 || joystick.moveY !== 0) {
      game.player.facing = Math.atan2(joystick.moveY, joystick.moveX);
    }
    const aim = game.getSmartAimPoint(game.player, MiniHoK.Config.FLASH_RANGE, true);
    game.castFlash(game.player, aim.x, aim.y);
  });
  bindSummonerTouch('btn-heal', () => game.castHeal(game.player));
  bindSummonerTouch('btn-recall', () => game.startRecall(game.player));

  // Minimap click / touch pans camera (or right-click sets move target)
  function panCameraFromMinimapClientPos(clientX, clientY) {
    if (!game) return;
    const rect = minimapCanvas.getBoundingClientRect();
    const rx = MiniHoK.Config.clamp((clientX - rect.left) / rect.width, 0, 1);
    const ry = MiniHoK.Config.clamp((clientY - rect.top) / rect.height, 0, 1);
    const wx = rx * game.map.width;
    const wy = ry * game.map.height;
    renderer.camera.locked = false;
    document.getElementById('btn-camera').classList.remove('active');
    renderer.snapCameraTo(wx, wy, game.map);
  }

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
  minimapCanvas.addEventListener(
    'touchstart',
    (e) => {
      if (!game) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      if (t) panCameraFromMinimapClientPos(t.clientX, t.clientY);
    },
    { passive: false }
  );
  minimapCanvas.addEventListener(
    'touchmove',
    (e) => {
      if (!game) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      if (t) panCameraFromMinimapClientPos(t.clientX, t.clientY);
    },
    { passive: false }
  );
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
      // Combine WASD / Arrow movement with virtual touch joystick
      const kbMoveX =
        (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      const kbMoveY =
        (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
      input.moveX = kbMoveX + joystick.moveX;
      input.moveY = kbMoveY + joystick.moveY;

      input.useMouseAim = isMouseAimActive();
      const worldAim = renderer.screenToWorld(input.mouseScreenX, input.mouseScreenY);
      input.aimX = worldAim.x;
      input.aimY = worldAim.y;

      game.update(dt, input);
      renderer.updateCamera(game, dt);

      let aimPreview = null;
      if (touchAimSkill && game.player && game.player.alive) {
        const touchAim = computeTouchSkillAim(touchAimSkill);
        aimPreview = { skillIndex: touchAimSkill.skillIndex, aimX: touchAim.x, aimY: touchAim.y };
      } else if (hoveredSkillIndex !== null) {
        aimPreview = { skillIndex: hoveredSkillIndex, aimX: input.aimX, aimY: input.aimY };
      }

      renderer.render(game, aimPreview);
      ui.updateHUD(game);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})();
