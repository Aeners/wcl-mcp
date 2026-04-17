export interface ActiveCharacter {
  name: string;
  realm: string;      // slug form
  region: string;     // normalized: us, eu, kr, tw
  class?: string;
  spec?: string;
  hasLogs?: boolean;
}

let activeCharacter: ActiveCharacter | null = null;

export function getActiveCharacter(): ActiveCharacter | null {
  return activeCharacter;
}

export function setActiveCharacter(character: ActiveCharacter): void {
  activeCharacter = character;
}

export function clearActiveCharacter(): void {
  activeCharacter = null;
}
