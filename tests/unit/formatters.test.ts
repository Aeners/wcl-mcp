import { describe, it, expect } from 'vitest';
import { formatDamageTable } from '../../src/formatters/damage.js';
import { formatHealingTable } from '../../src/formatters/healing.js';
import { formatDeathsTable, aggregateDeaths } from '../../src/formatters/deaths.js';
import { computeDps, computeHps, computeOverhealingPct, formatDuration } from '../../src/formatters/common.js';

describe('computeDps', () => {
  it('computes DPS from total and activeTime', () => {
    expect(computeDps(1_000_000, 300_000)).toBe(3333);
  });

  it('returns 0 for zero activeTime', () => {
    expect(computeDps(1000, 0)).toBe(0);
  });
});

describe('computeHps', () => {
  it('computes HPS from total and activeTime', () => {
    expect(computeHps(500_000, 300_000)).toBe(1667);
  });
});

describe('computeOverhealingPct', () => {
  it('computes overhealing percentage', () => {
    // 200 overheal out of 1000 total raw = 20%
    expect(computeOverhealingPct(200, 1000)).toBe(20);
  });

  it('returns 0 for zero total', () => {
    expect(computeOverhealingPct(100, 0)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats milliseconds to mm:ss', () => {
    expect(formatDuration(125000)).toBe('2:05');
    expect(formatDuration(300000)).toBe('5:00');
    expect(formatDuration(61000)).toBe('1:01');
  });
});

describe('formatDamageTable', () => {
  const entries = [
    { name: 'Player1', id: 1, guid: 1, type: 'Player', icon: 'Warrior-Arms', total: 1_000_000, activeTime: 300_000 },
    { name: 'Player2', id: 2, guid: 2, type: 'Player', icon: 'Mage-Frost', total: 800_000, activeTime: 300_000 },
    { name: 'SomePet', id: 3, guid: 3, type: 'Pet', icon: 'Pet', total: 200_000, activeTime: 300_000 },
  ];

  it('filters out pets and sorts by DPS', () => {
    const result = formatDamageTable(entries, 300_000);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Player1');
    expect(result[1].name).toBe('Player2');
  });

  it('assigns ranks correctly', () => {
    const result = formatDamageTable(entries, 300_000);
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it('filters by player name', () => {
    const result = formatDamageTable(entries, 300_000, 'Player2');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Player2');
  });
});

describe('formatHealingTable', () => {
  const entries = [
    { name: 'Healer1', id: 1, guid: 1, type: 'Player', icon: 'Priest-Holy', total: 500_000, activeTime: 300_000, overheal: 100_000 },
  ];

  it('computes HPS and overhealing', () => {
    const result = formatHealingTable(entries, 300_000);
    expect(result[0].hps).toBe(1667);
    expect(result[0].overhealingPct).toBeCloseTo(16.7, 0);
  });
});

describe('formatDeathsTable', () => {
  const entries = [
    {
      name: 'Player1', id: 1, guid: 1, type: 'Player', icon: 'Warrior-Arms',
      deathTime: 50000,
      killingBlow: { name: 'Fireball', guid: 100, type: 1 },
      damage: { total: 100000, activeTime: 50000, activeTimeReduced: 50000, abilities: [{ name: 'Fireball', total: 80000, type: 1 }] },
      healing: { total: 20000, activeTime: 50000, activeTimeReduced: 50000, abilities: [] },
    },
    {
      name: 'Player1', id: 1, guid: 1, type: 'Player', icon: 'Warrior-Arms',
      deathTime: 120000,
      killingBlow: { name: 'Fireball', guid: 100, type: 1 },
      damage: { total: 90000, activeTime: 120000, activeTimeReduced: 120000, abilities: [{ name: 'Fireball', total: 90000, type: 1 }] },
      healing: { total: 10000, activeTime: 120000, activeTimeReduced: 120000, abilities: [] },
    },
  ];

  it('aggregates deaths by ability', () => {
    const result = formatDeathsTable(entries);
    expect(result.totalDeaths).toBe(2);
    expect(result.deathsByAbility[0].ability).toBe('Fireball');
    expect(result.deathsByAbility[0].count).toBe(2);
  });

  it('filters by player name', () => {
    const result = formatDeathsTable(entries, 'Player1');
    expect(result.totalDeaths).toBe(2);
  });
});

describe('aggregateDeaths', () => {
  it('merges death counts from deathsByAbility and deathsByPlayer', () => {
    const death1 = { playerName: 'P1', classSpec: 'Warrior-Arms', deathTime: 1000, killingBlow: 'Fireball', topDamageSources: [] };
    const death2 = { playerName: 'P1', classSpec: 'Warrior-Arms', deathTime: 2000, killingBlow: 'Fireball', topDamageSources: [] };
    const death3 = { playerName: 'P1', classSpec: 'Warrior-Arms', deathTime: 3000, killingBlow: 'Fireball', topDamageSources: [] };
    const agg1 = { totalDeaths: 2, deathsByAbility: [{ ability: 'Fireball', count: 2 }], deathsByPlayer: [{ player: 'P1', count: 2 }], deaths: [death1, death2] };
    const agg2 = { totalDeaths: 1, deathsByAbility: [{ ability: 'Fireball', count: 1 }], deathsByPlayer: [{ player: 'P1', count: 1 }], deaths: [death3] };
    const result = aggregateDeaths([agg1, agg2]);
    expect(result.totalDeaths).toBe(3);
    expect(result.deathsByAbility[0].count).toBe(3);
    expect(result.deathsByPlayer[0].count).toBe(3);
  });
});
