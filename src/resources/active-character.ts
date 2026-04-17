import { getActiveCharacter } from '../session/context.js';

export function getActiveCharacterResource(): string {
  const character = getActiveCharacter();
  if (!character) {
    return JSON.stringify({ active: false });
  }
  return JSON.stringify({
    active: true,
    name: character.name,
    realm: character.realm,
    region: character.region,
    class: character.class ?? null,
    spec: character.spec ?? null,
    hasLogs: character.hasLogs ?? null,
  });
}
