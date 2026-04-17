import { type WCLTableEntry } from '../wcl/queries.js';

export interface DamageTakenEntry {
  name: string;
  classSpec: string;
  totalDamageTaken: number;
  sources: Array<{
    abilityName: string;
    totalDamage: number;
  }>;
}

export function formatDamageTakenTable(
  entries: WCLTableEntry[],
  playerName?: string,
): DamageTakenEntry[] {
  let players = entries.filter(e => e.type !== 'Pet');

  if (playerName) {
    players = players.filter(e => e.name.toLowerCase() === playerName.toLowerCase());
  }

  return players
    .map(e => ({
      name: e.name,
      classSpec: e.icon,
      totalDamageTaken: e.total,
      sources: (e.abilities ?? [])
        .map(a => ({ abilityName: a.name, totalDamage: a.total }))
        .sort((a, b) => b.totalDamage - a.totalDamage),
    }))
    .sort((a, b) => b.totalDamageTaken - a.totalDamageTaken);
}
