window.MiniHoK = window.MiniHoK || {};

MiniHoK.Map = (function () {
  const { TEAM_BLUE, TEAM_RED, MODES } = MiniHoK.Config;

  function makeTower(id, team, lane, tier, x, y) {
    return {
      id,
      type: 'tower',
      team,
      lane,
      tier,
      x,
      y,
      radius: 34,
      range: 265,
      hp: tier === 1 ? 2400 : 3000,
      maxHp: tier === 1 ? 2400 : 3000,
      ad: tier === 1 ? 155 : 185,
      attackCd: 1.05,
      cdTimer: 0,
      targetId: null,
      alive: true,
      flashTimer: 0,
    };
  }

  function makeCrystal(team, x, y) {
    return {
      id: team === TEAM_BLUE ? 'crystal_blue' : 'crystal_red',
      type: 'crystal',
      team,
      x,
      y,
      radius: 48,
      range: 270,
      hp: 4200,
      maxHp: 4200,
      ad: 175,
      attackCd: 0.95,
      cdTimer: 0,
      targetId: null,
      alive: true,
      flashTimer: 0,
    };
  }

  function createMap(modeId) {
    const mode = MODES[modeId] || MODES['3v3'];
    const S = mode.mapSize;
    const blueFountain = { team: TEAM_BLUE, x: 150, y: S - 150, radius: 115 };
    const redFountain = { team: TEAM_RED, x: S - 150, y: 150, radius: 115 };
    const blueCrystal = makeCrystal(TEAM_BLUE, 300, S - 300);
    const redCrystal = makeCrystal(TEAM_RED, S - 300, 300);

    const lanes = [];
    const towers = [];
    const bushes = [];
    const camps = [];
    const obstacles = [];

    if (modeId === '1v1') {
      const midWaypoints = [
        { x: 340, y: S - 340 },
        { x: S * 0.36, y: S * 0.64 },
        { x: S * 0.5, y: S * 0.5 },
        { x: S * 0.64, y: S * 0.36 },
        { x: S - 340, y: 340 },
      ];
      lanes.push({ id: 'mid', width: 220, waypoints: midWaypoints });

      towers.push(makeTower('t_b_mid_1', TEAM_BLUE, 'mid', 1, S * 0.33, S * 0.67));
      towers.push(makeTower('t_r_mid_1', TEAM_RED, 'mid', 1, S * 0.67, S * 0.33));

      bushes.push(
        { id: 'b1', x: S * 0.42, y: S * 0.44, radius: 52 },
        { id: 'b2', x: S * 0.58, y: S * 0.56, radius: 52 }
      );

      // Center side healing / buff sprite
      camps.push({
        id: 'camp_river',
        kind: 'tyrant',
        name: '河道之灵',
        x: S * 0.37,
        y: S * 0.37,
        respawnTime: 45,
        initialDelay: 18,
        hp: 1100,
        ad: 48,
        gold: 160,
        xp: 180,
        radius: 26,
      });
    } else if (modeId === '3v3') {
      const midWaypoints = [
        { x: 340, y: S - 340 },
        { x: S * 0.3, y: S * 0.7 },
        { x: S * 0.5, y: S * 0.5 },
        { x: S * 0.7, y: S * 0.3 },
        { x: S - 340, y: 340 },
      ];
      lanes.push({ id: 'mid', width: 230, waypoints: midWaypoints });

      // 2 towers per side along mid
      towers.push(makeTower('t_b_mid_2', TEAM_BLUE, 'mid', 2, S * 0.24, S * 0.76));
      towers.push(makeTower('t_b_mid_1', TEAM_BLUE, 'mid', 1, S * 0.37, S * 0.63));
      towers.push(makeTower('t_r_mid_2', TEAM_RED, 'mid', 2, S * 0.76, S * 0.24));
      towers.push(makeTower('t_r_mid_1', TEAM_RED, 'mid', 1, S * 0.63, S * 0.37));

      // Strategic bushes around mid & jungle
      bushes.push(
        { id: 'b1', x: S * 0.41, y: S * 0.44, radius: 54 },
        { id: 'b2', x: S * 0.59, y: S * 0.56, radius: 54 },
        { id: 'b3', x: S * 0.28, y: S * 0.48, radius: 56 },
        { id: 'b4', x: S * 0.72, y: S * 0.52, radius: 56 },
        { id: 'b5', x: S * 0.46, y: S * 0.74, radius: 54 },
        { id: 'b6', x: S * 0.54, y: S * 0.26, radius: 54 }
      );

      // Decorative jungle stone pillars (passable collision circles)
      obstacles.push(
        { x: S * 0.33, y: S * 0.38, radius: 56 },
        { x: S * 0.67, y: S * 0.62, radius: 56 }
      );

      // Jungle Camps: Red, Blue, and Tyrant Dragon
      camps.push(
        {
          id: 'camp_blue_b',
          kind: 'blue',
          name: '蔚蓝石像 (蓝Buff)',
          x: S * 0.22,
          y: S * 0.55,
          respawnTime: 55,
          initialDelay: 12,
          hp: 1150,
          ad: 52,
          gold: 130,
          xp: 160,
          radius: 26,
        },
        {
          id: 'camp_red_b',
          kind: 'red',
          name: '猩红石像 (红Buff)',
          x: S * 0.46,
          y: S * 0.81,
          respawnTime: 55,
          initialDelay: 12,
          hp: 1150,
          ad: 58,
          gold: 130,
          xp: 160,
          radius: 26,
        },
        {
          id: 'camp_blue_r',
          kind: 'blue',
          name: '蔚蓝石像 (蓝Buff)',
          x: S * 0.78,
          y: S * 0.45,
          respawnTime: 55,
          initialDelay: 12,
          hp: 1150,
          ad: 52,
          gold: 130,
          xp: 160,
          radius: 26,
        },
        {
          id: 'camp_red_r',
          kind: 'red',
          name: '猩红石像 (红Buff)',
          x: S * 0.54,
          y: S * 0.19,
          respawnTime: 55,
          initialDelay: 12,
          hp: 1150,
          ad: 58,
          gold: 130,
          xp: 160,
          radius: 26,
        },
        {
          id: 'camp_tyrant',
          kind: 'tyrant',
          name: '暴君 (全队增益)',
          x: S * 0.69,
          y: S * 0.73,
          respawnTime: 75,
          initialDelay: 35,
          hp: 2400,
          ad: 78,
          gold: 260,
          xp: 300,
          radius: 34,
        }
      );
    } else {
      // 5v5 Classic 3-Lane Canyon
      const pad = 210;
      const topWaypoints = [
        { x: 260, y: S - 360 },
        { x: pad, y: S * 0.58 },
        { x: pad, y: pad },
        { x: S * 0.48, y: pad },
        { x: S - 340, y: 260 },
      ];
      const midWaypoints = [
        { x: 340, y: S - 340 },
        { x: S * 0.35, y: S * 0.65 },
        { x: S * 0.5, y: S * 0.5 },
        { x: S * 0.65, y: S * 0.35 },
        { x: S - 340, y: 340 },
      ];
      const botWaypoints = [
        { x: 360, y: S - 260 },
        { x: S * 0.52, y: S - pad },
        { x: S - pad, y: S - pad },
        { x: S - pad, y: S * 0.42 },
        { x: S - 260, y: 340 },
      ];

      lanes.push(
        { id: 'top', width: 175, waypoints: topWaypoints },
        { id: 'mid', width: 185, waypoints: midWaypoints },
        { id: 'bot', width: 175, waypoints: botWaypoints }
      );

      // Towers on each lane (1 outer + 1 inner on mid, 1 outer on top/bot)
      towers.push(
        makeTower('t_b_top_1', TEAM_BLUE, 'top', 1, pad, S * 0.44),
        makeTower('t_r_top_1', TEAM_RED, 'top', 1, S * 0.56, pad),
        makeTower('t_b_mid_2', TEAM_BLUE, 'mid', 2, S * 0.25, S * 0.75),
        makeTower('t_b_mid_1', TEAM_BLUE, 'mid', 1, S * 0.38, S * 0.62),
        makeTower('t_r_mid_2', TEAM_RED, 'mid', 2, S * 0.75, S * 0.25),
        makeTower('t_r_mid_1', TEAM_RED, 'mid', 1, S * 0.62, S * 0.38),
        makeTower('t_b_bot_1', TEAM_BLUE, 'bot', 1, S * 0.44, S - pad),
        makeTower('t_r_bot_1', TEAM_RED, 'bot', 1, S - pad, S * 0.56)
      );

      bushes.push(
        { id: 'b_mid1', x: S * 0.43, y: S * 0.46, radius: 52 },
        { id: 'b_mid2', x: S * 0.57, y: S * 0.54, radius: 52 },
        { id: 'b_top1', x: pad + 70, y: S * 0.28, radius: 50 },
        { id: 'b_bot1', x: S - pad - 70, y: S * 0.72, radius: 50 },
        { id: 'b_jg1', x: S * 0.33, y: S * 0.35, radius: 52 },
        { id: 'b_jg2', x: S * 0.67, y: S * 0.65, radius: 52 }
      );

      obstacles.push(
        { x: S * 0.31, y: S * 0.52, radius: 58 },
        { x: S * 0.69, y: S * 0.48, radius: 58 },
        { x: S * 0.48, y: S * 0.31, radius: 58 },
        { x: S * 0.52, y: S * 0.69, radius: 58 }
      );

      camps.push(
        {
          id: 'camp_blue_b',
          kind: 'blue',
          name: '蓝Buff',
          x: S * 0.24,
          y: S * 0.6,
          respawnTime: 55,
          initialDelay: 12,
          hp: 1200,
          ad: 54,
          gold: 135,
          xp: 165,
          radius: 26,
        },
        {
          id: 'camp_red_b',
          kind: 'red',
          name: '红Buff',
          x: S * 0.4,
          y: S * 0.78,
          respawnTime: 55,
          initialDelay: 12,
          hp: 1200,
          ad: 58,
          gold: 135,
          xp: 165,
          radius: 26,
        },
        {
          id: 'camp_blue_r',
          kind: 'blue',
          name: '蓝Buff',
          x: S * 0.76,
          y: S * 0.4,
          respawnTime: 55,
          initialDelay: 12,
          hp: 1200,
          ad: 54,
          gold: 135,
          xp: 165,
          radius: 26,
        },
        {
          id: 'camp_red_r',
          kind: 'red',
          name: '红Buff',
          x: S * 0.6,
          y: S * 0.22,
          respawnTime: 55,
          initialDelay: 12,
          hp: 1200,
          ad: 58,
          gold: 135,
          xp: 165,
          radius: 26,
        },
        {
          id: 'camp_tyrant',
          kind: 'tyrant',
          name: '暗影暴君',
          x: S * 0.66,
          y: S * 0.66,
          respawnTime: 75,
          initialDelay: 35,
          hp: 2600,
          ad: 82,
          gold: 280,
          xp: 320,
          radius: 34,
        }
      );
    }

    return {
      modeId,
      width: S,
      height: S,
      fountains: [blueFountain, redFountain],
      crystals: [blueCrystal, redCrystal],
      lanes,
      towers,
      bushes,
      obstacles,
      camps,
    };
  }

  return { createMap };
})();
