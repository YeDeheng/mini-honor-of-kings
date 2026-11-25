window.MiniHoK = window.MiniHoK || {};

MiniHoK.AI = (function () {
  const { dist, angle, TEAM_BLUE, TEAM_RED } = MiniHoK.Config;

  function getLaneAnchor(hero, game) {
    const lane = game.map.lanes.find((l) => l.id === hero.lane) || game.map.lanes[0];
    const pts = lane.waypoints;
    if (hero.team === TEAM_BLUE) {
      return pts[Math.min(pts.length - 1, Math.floor(pts.length / 2))];
    }
    return pts[Math.max(0, Math.floor(pts.length / 2))];
  }

  function isUnderEnemyTower(x, y, team, game) {
    for (const t of game.map.towers) {
      if (t.alive && t.team !== team && dist(x, y, t.x, t.y) < t.range + 22) {
        return t;
      }
    }
    const enemyCrystal = game.map.crystals[team === TEAM_BLUE ? TEAM_RED : TEAM_BLUE];
    if (enemyCrystal.alive && dist(x, y, enemyCrystal.x, enemyCrystal.y) < enemyCrystal.range + 22) {
      return enemyCrystal;
    }
    return null;
  }

  function hasAlliedMinionUnderTower(tower, team, game) {
    for (const m of game.minions) {
      if (m.alive && m.team === team && dist(m.x, m.y, tower.x, tower.y) < tower.range - 10) {
        return true;
      }
    }
    return false;
  }

  function tryAIShop(hero, game) {
    const recs = MiniHoK.Items.getRecommended(hero, hero.gold);
    if (recs.length > 0 && hero.items.length < MiniHoK.Config.MAX_ITEMS) {
      game.buyItem(hero, recs[0].id);
    }
  }

  function updateHeroAI(hero, game, dt) {
    if (!hero.alive) return;

    hero.aiTimer = (hero.aiTimer || 0) - dt;
    if (hero.aiTimer <= 0) {
      hero.aiTimer = 0.25 + Math.random() * 0.15;
      tryAIShop(hero, game);
    }

    const fountain = game.map.fountains[hero.team];
    const enemyTeam = hero.team === TEAM_BLUE ? TEAM_RED : TEAM_BLUE;
    const hpRatio = hero.hp / hero.stats.maxHp;

    // 1. Low HP retreat logic
    if (hpRatio < 0.26) {
      hero.aiRetreating = true;
    } else if (hpRatio > 0.78) {
      hero.aiRetreating = false;
    }

    if (hero.aiRetreating) {
      // Use heal spell if emergency
      if (hpRatio < 0.22 && hero.summonerCds.heal <= 0) {
        game.castHeal(hero);
      }
      const dFountain = dist(hero.x, hero.y, fountain.x, fountain.y);
      if (dFountain > fountain.radius * 0.6) {
        moveToward(hero, fountain.x, fountain.y, dt, game);
      }
      return;
    }

    // 2. Check tower danger: back off if under enemy tower without minions or being targeted
    const dangerTower = isUnderEnemyTower(hero.x, hero.y, hero.team, game);
    if (dangerTower) {
      const safeMinions = hasAlliedMinionUnderTower(dangerTower, hero.team, game);
      if (!safeMinions || dangerTower.targetId === hero.id) {
        const awayAng = angle(dangerTower.x, dangerTower.y, hero.x, hero.y);
        const rx = hero.x + Math.cos(awayAng) * 180;
        const ry = hero.y + Math.sin(awayAng) * 180;
        moveToward(hero, rx, ry, dt, game);
        return;
      }
    }

    // 3. Find visible nearby targets
    let bestHero = null;
    let bestHeroDist = 560;
    for (const other of game.heroes) {
      if (!other.alive || other.team === hero.team || other.untargetable > 0) continue;
      if (!game.isVisibleToTeam(other, hero.team)) continue;
      const d = dist(hero.x, hero.y, other.x, other.y);
      // Prioritize low HP heroes slightly
      const score = d - (1 - other.hp / other.stats.maxHp) * 120;
      if (d < 560 && score < bestHeroDist) {
        bestHeroDist = score;
        bestHero = other;
      }
    }

    let bestMinion = null;
    let bestMinionDist = 480;
    for (const m of game.minions) {
      if (!m.alive || m.team === hero.team) continue;
      const d = dist(hero.x, hero.y, m.x, m.y);
      if (d < bestMinionDist) {
        bestMinionDist = d;
        bestMinion = m;
      }
    }

    // Nearest pushable enemy structure
    let bestStructure = null;
    let bestStructDist = 460;
    const structs = [...game.map.towers, game.map.crystals[enemyTeam]];
    for (const st of structs) {
      if (!st.alive || st.team === hero.team) continue;
      const d = dist(hero.x, hero.y, st.x, st.y);
      if (d < bestStructDist && hasAlliedMinionUnderTower(st, hero.team, game)) {
        bestStructDist = d;
        bestStructure = st;
      }
    }

    // Choose combat target
    let target = null;
    if (bestHero && (hpRatio > 0.35 || bestHero.hp / bestHero.stats.maxHp < 0.3)) {
      target = bestHero;
    } else if (bestStructure) {
      target = bestStructure;
    } else if (bestMinion) {
      target = bestMinion;
    }

    if (target) {
      const d = dist(hero.x, hero.y, target.x, target.y);
      const atkRange = hero.stats.range + (target.radius || 20);

      // Cast skills on enemy heroes (or clusters)
      if (target.type === 'hero') {
        tryAICastSkills(hero, target, d, game);
      } else if (target.type === 'minion' && hero.mp > hero.stats.maxMp * 0.55) {
        if (hero.skillCds[0] <= 0 && d < 280) {
          game.castSkill(hero, 0, target.x, target.y);
        }
      }

      // Kiting for ranged heroes vs melee
      const isRanged = hero.template.attackType === 'ranged';
      if (isRanged && target.type === 'hero' && d < atkRange * 0.58) {
        const backAng = angle(target.x, target.y, hero.x, hero.y);
        moveToward(hero, hero.x + Math.cos(backAng) * 110, hero.y + Math.sin(backAng) * 110, dt, game);
      } else if (d > atkRange - 12) {
        // Don't blindly walk into enemy tower without minions
        const nextDanger = isUnderEnemyTower(target.x, target.y, hero.team, game);
        if (!nextDanger || hasAlliedMinionUnderTower(nextDanger, hero.team, game) || target.hp < 180) {
          moveToward(hero, target.x, target.y, dt, game);
        }
      }

      if (d <= atkRange + 14) {
        game.performBasicAttack(hero, target);
      }
      return;
    }

    // 4. Otherwise march along assigned lane toward enemy crystal (following allied wave)
    const lane = game.map.lanes.find((l) => l.id === hero.lane) || game.map.lanes[0];
    const pts = lane.waypoints;
    const ordered = hero.team === TEAM_BLUE ? pts : [...pts].reverse();

    // Find next waypoint ahead
    let goal = ordered[ordered.length - 1];
    for (let i = 0; i < ordered.length; i++) {
      const p = ordered[i];
      if (dist(hero.x, hero.y, p.x, p.y) > 130) {
        // Check if waypoint is further toward enemy base than hero
        const enemyCrystal = game.map.crystals[enemyTeam];
        if (dist(p.x, p.y, enemyCrystal.x, enemyCrystal.y) < dist(hero.x, hero.y, enemyCrystal.x, enemyCrystal.y)) {
          goal = p;
          break;
        }
      }
    }

    // Slight lane jitter so AI heroes don't stack on exact pixel
    const offsetAngle = (hero.aiSeed || 0) * Math.PI * 2;
    const gx = goal.x + Math.cos(offsetAngle) * 32;
    const gy = goal.y + Math.sin(offsetAngle) * 32;

    // Wait slightly behind enemy tower if no minions
    const towerAhead = isUnderEnemyTower(gx, gy, hero.team, game);
    if (towerAhead && !hasAlliedMinionUnderTower(towerAhead, hero.team, game)) {
      const holdAng = angle(towerAhead.x, towerAhead.y, fountain.x, fountain.y);
      moveToward(
        hero,
        towerAhead.x + Math.cos(holdAng) * (towerAhead.range + 75),
        towerAhead.y + Math.sin(holdAng) * (towerAhead.range + 75),
        dt,
        game
      );
    } else {
      moveToward(hero, gx, gy, dt, game);
    }
  }

  function tryAICastSkills(hero, target, d, game) {
    // Skill 3 (Ultimate)
    const s2 = hero.template.skills[2];
    if (hero.skillCds[2] <= 0 && hero.mp >= s2.mana && d <= Math.min(s2.range, 520)) {
      if (target.hp / target.stats.maxHp < 0.72 || d < 280) {
        game.castSkill(hero, 2, target.x, target.y);
        return;
      }
    }
    // Skill 2
    const s1 = hero.template.skills[1];
    if (hero.skillCds[1] <= 0 && hero.mp >= s1.mana && d <= s1.range + 20) {
      game.castSkill(hero, 1, target.x, target.y);
      return;
    }
    // Skill 1
    const s0 = hero.template.skills[0];
    if (hero.skillCds[0] <= 0 && hero.mp >= s0.mana && d <= Math.max(s0.range, 280)) {
      game.castSkill(hero, 0, target.x, target.y);
    }
  }

  function moveToward(hero, tx, ty, dt, game) {
    const d = dist(hero.x, hero.y, tx, ty);
    if (d < 6) return;
    const ang = angle(hero.x, hero.y, tx, ty);
    hero.facing = ang;
    game.moveEntity(hero, Math.cos(ang), Math.sin(ang), dt);
  }

  return { updateHeroAI, getLaneAnchor };
})();
