import { type WCLTableEntry } from '../wcl/queries.js';

export interface CastEntry {
  abilityName: string;
  totalCasts: number;
  averageCastsPerFight: number;
  fightsAnalyzed: number;
}

export interface CastSummary {
  playerName: string;
  classSpec: string;
  fightsAnalyzed: number;
  abilities: CastEntry[];
}

export function formatCastsTable(
  entries: WCLTableEntry[],
  playerName?: string,
): Array<{ name: string; classSpec: string; abilities: Array<{ name: string; total: number }> }> {
  let players = entries.filter(e => e.type !== 'Pet');

  if (playerName) {
    players = players.filter(e => e.name.toLowerCase() === playerName.toLowerCase());
  }

  return players.map(e => ({
    name: e.name,
    classSpec: e.icon,
    abilities: (e.abilities ?? [])
      .map(a => ({ name: a.name, total: a.total }))
      .sort((a, b) => b.total - a.total),
  }));
}

export function aggregateCasts(
  perFightData: Array<Array<{ name: string; classSpec: string; abilities: Array<{ name: string; total: number }> }>>,
  playerName: string,
): CastSummary {
  const abilityTotals = new Map<string, number>();
  let classSpec = '';
  let fightsAnalyzed = 0;

  for (const fightEntries of perFightData) {
    const playerEntry = fightEntries.find(e => e.name.toLowerCase() === playerName.toLowerCase());
    if (!playerEntry) continue;
    fightsAnalyzed++;
    classSpec = playerEntry.classSpec;
    for (const ability of playerEntry.abilities) {
      abilityTotals.set(ability.name, (abilityTotals.get(ability.name) ?? 0) + ability.total);
    }
  }

  const abilities: CastEntry[] = Array.from(abilityTotals.entries())
    .map(([abilityName, totalCasts]) => ({
      abilityName,
      totalCasts,
      averageCastsPerFight: fightsAnalyzed > 0 ? Math.round(totalCasts / fightsAnalyzed * 10) / 10 : 0,
      fightsAnalyzed,
    }))
    .sort((a, b) => b.totalCasts - a.totalCasts);

  return {
    playerName,
    classSpec,
    fightsAnalyzed,
    abilities,
  };
}
