// Helpers for turning raw WCL event payloads into something an AI can reason
// about without re-deriving the pull timestamp on every question.

export interface RawEvent {
  timestamp: number;
  [key: string]: unknown;
}

/**
 * Seconds since the pull, at millisecond precision.
 * Negative for pre-pull events (a cast that completed just after the pull was
 * started before it).
 */
export function toRelativeSeconds(timestamp: number, pullTimestamp: number): number {
  return Math.round(timestamp - pullTimestamp) / 1000;
}

/** Attach `relativeTime` (seconds since pull) to every event. */
export function withRelativeTime<T extends RawEvent>(
  events: T[],
  pullTimestamp: number,
): Array<T & { relativeTime: number }> {
  return events.map(e => ({
    ...e,
    relativeTime: toRelativeSeconds(e.timestamp, pullTimestamp),
  }));
}

/**
 * Attach `abilityName` (and `killingAbilityName` on death events) using the
 * report's masterData ability table, so callers never have to resolve a bare
 * spell ID against a separate lookup.
 */
export function withAbilityNames<T extends RawEvent>(
  events: T[],
  abilityNames: Map<number, string>,
): T[] {
  return events.map(e => {
    const enriched: RawEvent = { ...e };

    const abilityId = e.abilityGameID as number | undefined;
    if (typeof abilityId === 'number') {
      const name = abilityNames.get(abilityId);
      if (name) enriched.abilityName = name;
    }

    const killingId = e.killingAbilityGameID as number | undefined;
    if (typeof killingId === 'number') {
      const name = abilityNames.get(killingId);
      if (name) enriched.killingAbilityName = name;
    }

    return enriched as T;
  });
}
