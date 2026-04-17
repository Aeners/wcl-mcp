import { type WCLTableEntry } from '../wcl/queries.js';
import { computeDps } from './common.js';

export interface DamageEntry {
  name: string;
  classSpec: string;
  totalDamage: number;
  dps: number;
  activeTimeMs: number;
  rank: number;
}

export function formatDamageTable(
  entries: WCLTableEntry[],
  totalTime: number,
  playerName?: string,
): DamageEntry[] {
  let players = entries.filter(e => e.type !== 'Pet');

  if (playerName) {
    players = players.filter(e => e.name.toLowerCase() === playerName.toLowerCase());
  }

  const sorted = players
    .map(e => ({
      name: e.name,
      classSpec: e.icon,
      totalDamage: e.total,
      dps: computeDps(e.total, e.activeTime ?? totalTime),
      activeTimeMs: e.activeTime ?? totalTime,
      rank: 0,
    }))
    .sort((a, b) => b.dps - a.dps);

  sorted.forEach((entry, i) => { entry.rank = i + 1; });
  return sorted;
}
