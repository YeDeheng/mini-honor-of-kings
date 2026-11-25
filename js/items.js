window.MiniHoK = window.MiniHoK || {};

MiniHoK.Items = (function () {
  const LIST = [
    {
      id: 'boots',
      name: '影忍之足',
      icon: '👢',
      price: 550,
      roles: ['warrior', 'marksman', 'mage', 'assassin'],
      desc: '+45 移速 · +22 防御',
      stats: { speed: 45, armor: 22 },
    },
    {
      id: 'axe',
      name: '暗影战斧',
      icon: '🪓',
      price: 1350,
      roles: ['warrior', 'assassin'],
      desc: '+45 攻击 · +320 生命 · +12% 冷却缩减',
      stats: { ad: 45, maxHp: 320, cdr: 0.12 },
    },
    {
      id: 'crit_blade',
      name: '无尽战刃',
      icon: '⚔️',
      price: 1450,
      roles: ['marksman', 'assassin'],
      desc: '+65 攻击 · +25% 暴击率',
      stats: { ad: 65, crit: 0.25 },
    },
    {
      id: 'bow',
      name: '闪电匕首',
      icon: '🏹',
      price: 1200,
      roles: ['marksman'],
      desc: '+30% 攻速 · +15% 暴击率 · +25 移速',
      stats: { aspd: 0.3, crit: 0.15, speed: 25 },
    },
    {
      id: 'vamp',
      name: '泣血之刃',
      icon: '🩸',
      price: 1250,
      roles: ['marksman', 'assassin', 'warrior'],
      desc: '+50 攻击 · +20% 物理吸血',
      stats: { ad: 50, lifesteal: 0.2 },
    },
    {
      id: 'staff',
      name: '博学者之怒',
      icon: '🔮',
      price: 1500,
      roles: ['mage'],
      desc: '+110 法强 · +10% 冷却缩减',
      stats: { ap: 110, cdr: 0.1 },
    },
    {
      id: 'echo',
      name: '回响之杖',
      icon: '✨',
      price: 1300,
      roles: ['mage'],
      desc: '+85 法强 · +30 移速 · +220 法力',
      stats: { ap: 85, speed: 30, maxMp: 220 },
    },
    {
      id: 'armor',
      name: '不祥征兆',
      icon: '🛡️',
      price: 1350,
      roles: ['warrior'],
      desc: '+680 生命 · +55 防御',
      stats: { maxHp: 680, armor: 55 },
    },
    {
      id: 'cloak',
      name: '魔女斗篷',
      icon: '🧥',
      price: 1250,
      roles: ['warrior', 'mage', 'marksman'],
      desc: '+520 生命 · +45 防御 · +15 移速',
      stats: { maxHp: 520, armor: 45, speed: 15 },
    },
    {
      id: 'breaker',
      name: '破军',
      icon: '🗡️',
      price: 1850,
      roles: ['assassin', 'warrior', 'marksman'],
      desc: '+105 攻击（高额收割爆发）',
      stats: { ad: 105 },
    },
  ];

  const MAP = {};
  LIST.forEach((it) => { MAP[it.id] = it; });

  return {
    LIST,
    getById(id) {
      return MAP[id] || null;
    },
    getRecommended(hero, gold) {
      if (!hero || hero.items.length >= MiniHoK.Config.MAX_ITEMS) return [];
      const ownedCounts = {};
      hero.items.forEach((id) => { ownedCounts[id] = (ownedCounts[id] || 0) + 1; });

      const candidates = LIST.filter((it) => {
        if (it.id === 'boots' && ownedCounts.boots) return false;
        if ((ownedCounts[it.id] || 0) >= 2) return false;
        return it.price <= gold;
      });

      candidates.sort((a, b) => {
        const aFit = a.roles.includes(hero.template.role) ? 1 : 0;
        const bFit = b.roles.includes(hero.template.role) ? 1 : 0;
        if (aFit !== bFit) return bFit - aFit;
        // Prefer boots first if not owned
        if (!ownedCounts.boots && (a.id === 'boots' || b.id === 'boots')) {
          return a.id === 'boots' ? -1 : 1;
        }
        return b.price - a.price;
      });

      return candidates.slice(0, 2);
    },
  };
})();
