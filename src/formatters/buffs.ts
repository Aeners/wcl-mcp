import { type WCLTableEntry } from '../wcl/queries.js';

export interface BuffUptimeEntry {
  playerName: string;
  classSpec: string;
  buffs: Array<{
    abilityName: string;
    uptimePct: number;
    totalUptime: number;
  }>;
}

export function formatBuffTable(
  entries: WCLTableEntry[],
  totalTime: number,
  playerName?: string,
): BuffUptimeEntry[] {
  let players = entries.filter(e => e.type !== 'Pet');

  if (playerName) {
    players = players.filter(e => e.name.toLowerCase() === playerName.toLowerCase());
  }

  return players.map(e => ({
    playerName: e.name,
    classSpec: e.icon,
    buffs: (e.abilities ?? [])
      .map(a => ({
        abilityName: a.name,
        uptimePct: totalTime > 0 ? Math.round(a.total / totalTime * 1000) / 10 : 0,
        totalUptime: a.total,
      }))
      .sort((a, b) => b.uptimePct - a.uptimePct),
  }));
}
