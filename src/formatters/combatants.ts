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
