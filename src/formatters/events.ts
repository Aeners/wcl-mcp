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
