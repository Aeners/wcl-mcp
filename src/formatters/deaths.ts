import { type WCLDeathEntry } from '../wcl/queries.js';

export interface DeathEvent {
  playerName: string;
  classSpec: string;
  deathTime: number;
  killingBlow?: string;
  topDamageSources: Array<{ name: string; total: number }>;
}

export interface DeathAggregation {
  totalDeaths: number;
  deathsByAbility: Array<{ ability: string; count: number }>;
  deathsByPlayer: Array<{ player: string; count: number }>;
  deaths: DeathEvent[];
}

export function formatDeathsTable(entries: WCLDeathEntry[], playerName?: string): DeathAggregation {
  let filtered = entries;
  if (playerName) {
    filtered = entries.filter(e => e.name.toLowerCase() === playerName.toLowerCase());
  }

  const deathEvents: DeathEvent[] = filtered.map(e => ({
    playerName: e.name,
    classSpec: e.icon,
    deathTime: e.deathTime,
    killingBlow: e.killingBlow?.name,
    topDamageSources: (e.damage?.abilities ?? [])
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(a => ({ name: a.name, total: a.total })),
  }));

  // Aggregate by killing blow
  const abilityCount = new Map<string, number>();
  for (const d of deathEvents) {
    const ability = d.killingBlow ?? 'Unknown';
    abilityCount.set(ability, (abilityCount.get(ability) ?? 0) + 1);
  }

  // Aggregate by player
  const playerCount = new Map<string, number>();
  for (const d of deathEvents) {
    playerCount.set(d.playerName, (playerCount.get(d.playerName) ?? 0) + 1);
  }

  return {
    totalDeaths: deathEvents.length,
    deathsByAbility: Array.from(abilityCount.entries())
      .map(([ability, count]) => ({ ability, count }))
      .sort((a, b) => b.count - a.count),
    deathsByPlayer: Array.from(playerCount.entries())
      .map(([player, count]) => ({ player, count }))
      .sort((a, b) => b.count - a.count),
    deaths: deathEvents,
  };
}

export function aggregateDeaths(aggregations: DeathAggregation[]): DeathAggregation {
  const allDeaths: DeathEvent[] = [];
  const abilityCount = new Map<string, number>();
  const playerCount = new Map<string, number>();

  for (const agg of aggregations) {
    allDeaths.push(...agg.deaths);
    for (const { ability, count } of agg.deathsByAbility) {
      abilityCount.set(ability, (abilityCount.get(ability) ?? 0) + count);
    }
    for (const { player, count } of agg.deathsByPlayer) {
      playerCount.set(player, (playerCount.get(player) ?? 0) + count);
    }
  }

  return {
    totalDeaths: allDeaths.length,
    deathsByAbility: Array.from(abilityCount.entries())
      .map(([ability, count]) => ({ ability, count }))
      .sort((a, b) => b.count - a.count),
    deathsByPlayer: Array.from(playerCount.entries())
      .map(([player, count]) => ({ player, count }))
      .sort((a, b) => b.count - a.count),
    deaths: allDeaths,
  };
}
