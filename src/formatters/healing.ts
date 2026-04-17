import { type WCLTableEntry } from '../wcl/queries.js';
import { computeHps, computeOverhealingPct } from './common.js';

export interface HealingEntry {
  name: string;
  classSpec: string;
  totalHealing: number;
  hps: number;
  overhealingPct: number;
  activeTimeMs: number;
  rank: number;
}

export function formatHealingTable(
  entries: WCLTableEntry[],
  totalTime: number,
  playerName?: string,
): HealingEntry[] {
  let players = entries.filter(e => e.type !== 'Pet');

  if (playerName) {
    players = players.filter(e => e.name.toLowerCase() === playerName.toLowerCase());
  }

  const sorted = players
    .map(e => {
      const overheal = e.overheal ?? 0;
      const totalRaw = e.total + overheal;
      return {
        name: e.name,
        classSpec: e.icon,
        totalHealing: e.total,
        hps: computeHps(e.total, e.activeTime ?? totalTime),
        overhealingPct: computeOverhealingPct(overheal, totalRaw),
        activeTimeMs: e.activeTime ?? totalTime,
        rank: 0,
      };
    })
    .sort((a, b) => b.hps - a.hps);

  sorted.forEach((entry, i) => { entry.rank = i + 1; });
  return sorted;
}
