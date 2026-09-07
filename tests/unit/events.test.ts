import { describe, it, expect } from 'vitest';
import { toRelativeSeconds, withRelativeTime } from '../../src/formatters/events.js';

describe('toRelativeSeconds', () => {
  it('converts an absolute timestamp to seconds since the pull', () => {
    expect(toRelativeSeconds(3587269, 3587007)).toBe(0.262);
  });

  it('returns 0 at the pull itself', () => {
    expect(toRelativeSeconds(3587007, 3587007)).toBe(0);
  });

  it('returns a negative value for pre-pull events', () => {
    expect(toRelativeSeconds(3586007, 3587007)).toBe(-1);
  });

  it('keeps millisecond precision', () => {
    expect(toRelativeSeconds(3600000, 3587007)).toBe(12.993);
  });
});

describe('withRelativeTime', () => {
  it('adds relativeTime to every event without dropping fields', () => {
    const events = [
      { timestamp: 3587269, type: 'cast', abilityGameID: 190984 },
      { timestamp: 3599710, type: 'cast', abilityGameID: 102560 },
    ];

    const result = withRelativeTime(events, 3587007);

    expect(result).toEqual([
      { timestamp: 3587269, type: 'cast', abilityGameID: 190984, relativeTime: 0.262 },
      { timestamp: 3599710, type: 'cast', abilityGameID: 102560, relativeTime: 12.703 },
    ]);
  });

  it('returns an empty array for no events', () => {
    expect(withRelativeTime([], 3587007)).toEqual([]);
  });
});
