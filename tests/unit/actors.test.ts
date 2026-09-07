import { describe, it, expect } from 'vitest';
import { resolveActorId, suggestActorNames } from '../../src/wcl/actors.js';

const actors = [
  { id: 24, name: 'Explanas', type: 'Player' },
  { id: 30, name: 'Nevernine', type: 'Player' },
  { id: 144, name: "Ula'tek", type: 'NPC' },
  { id: 153, name: 'Gore Rattle', type: 'NPC' },
];

describe('resolveActorId', () => {
  it('resolves a player name to its actor ID', () => {
    expect(resolveActorId(actors, 'Explanas').id).toBe(24);
  });

  it('resolves NPCs, not just players', () => {
    expect(resolveActorId(actors, 'Gore Rattle').id).toBe(153);
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(resolveActorId(actors, '  eXpLaNaS ').id).toBe(24);
  });

  it('reports no id for an unknown name', () => {
    const { id, matches } = resolveActorId(actors, 'Nobody');
    expect(id).toBeUndefined();
    expect(matches).toEqual([]);
  });

  it('reports every match so an ambiguous name can be flagged', () => {
    const dupes = [...actors, { id: 200, name: 'Gore Rattle', type: 'NPC' }];
    const { id, matches } = resolveActorId(dupes, 'Gore Rattle');
    expect(id).toBe(153);
    expect(matches).toHaveLength(2);
  });
});

describe('suggestActorNames', () => {
  it('prefers substring matches for a misspelled name', () => {
    expect(suggestActorNames(actors, 'rattle')[0]).toBe('Gore Rattle');
  });

  it('falls back to other actors when nothing matches', () => {
    expect(suggestActorNames(actors, 'zzzz')).toContain('Explanas');
  });

  it('does not repeat a name that both matched and was backfilled', () => {
    const names = suggestActorNames(actors, 'Explanas');
    expect(names.filter(n => n === 'Explanas')).toHaveLength(1);
  });

  it('respects the limit', () => {
    expect(suggestActorNames(actors, 'zzzz', 2)).toHaveLength(2);
  });
});
