import { type WCLActor } from '../wcl/queries.js';

export interface CombatantEntry {
  name: string;
  classSpec: string;
  // Additional fields will come from masterData combatant info
}

export function formatCombatants(actors: WCLActor[], playerName?: string): CombatantEntry[] {
  let players = actors.filter(a => a.type === 'Player');

  if (playerName) {
    players = players.filter(a => a.name.toLowerCase() === playerName.toLowerCase());
  }

  return players.map(a => ({
    name: a.name,
    classSpec: a.icon || a.subType,
  }));
}

/**
 * Narrow a Summary table to a single player.
 *
 * The Summary payload holds one entry per player in several parallel arrays,
 * which is why an unfiltered response for a 30-player raid runs to hundreds of
 * thousands of characters. Every array keyed by player name is filtered; the
 * scalar fields (totalTime, logVersion, ...) are passed through untouched.
 */
const PLAYER_KEYED_ARRAYS = [
  'composition',
  'damageDone',
  'healingDone',
  'damageTaken',
  'deathEvents',
] as const;

const PLAYER_ROLES = ['dps', 'tanks', 'healers'] as const;

interface NamedEntry { name?: string }

export function filterSummaryToPlayer(
  summary: unknown,
  playerName: string,
): unknown {
  if (typeof summary !== 'object' || summary === null) return summary;

  const wanted = playerName.trim().toLowerCase();
  const matches = (e: NamedEntry) => e?.name?.toLowerCase() === wanted;

  const source = summary as Record<string, unknown>;
  const out: Record<string, unknown> = { ...source };

  for (const key of PLAYER_KEYED_ARRAYS) {
    const value = source[key];
    if (Array.isArray(value)) out[key] = value.filter(matches);
  }

  const details = source.playerDetails;
  if (typeof details === 'object' && details !== null) {
    const filteredDetails: Record<string, unknown> = { ...(details as Record<string, unknown>) };
    for (const role of PLAYER_ROLES) {
      const value = filteredDetails[role];
      if (Array.isArray(value)) filteredDetails[role] = value.filter(matches);
    }
    out.playerDetails = filteredDetails;
  }

  return out;
}
