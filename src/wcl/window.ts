import type { WCLClient } from './client.js';
import { makeError, type ToolError } from '../formatters/common.js';

// Sub-windows of a fight, expressed the way people ask for them: "the first
// minute", "from 2:30 to 3:00". Callers pass seconds since the pull; the API
// wants absolute report timestamps.

export const FIGHT_TIMES_QUERY = `
query FightTimes($code: String!, $fightIDs: [Int]!) {
  reportData {
    report(code: $code) {
      fights(fightIDs: $fightIDs) {
        id
        startTime
        endTime
      }
    }
  }
}
`;

export interface FightTimes {
  id: number;
  startTime: number;
  endTime: number;
}

export interface ResolvedWindow {
  startTime: number;
  endTime: number;
  pullTimestamp: number;
  /** True when the caller asked for a sub-window rather than the whole fight. */
  isPartial: boolean;
}

/**
 * Turn seconds-since-pull into absolute timestamps, clamped to the fight.
 * Returns undefined when neither bound was given.
 */
export function computeWindow(
  fight: { startTime: number; endTime: number },
  startS?: number,
  endS?: number,
): ResolvedWindow | ToolError {
  const isPartial = startS !== undefined || endS !== undefined;

  const startTime = startS === undefined
    ? fight.startTime
    : Math.min(Math.max(fight.startTime + startS * 1000, fight.startTime), fight.endTime);
  const endTime = endS === undefined
    ? fight.endTime
    : Math.min(Math.max(fight.startTime + endS * 1000, fight.startTime), fight.endTime);

  if (startTime > endTime) {
    return makeError(
      'invalid_window',
      `start_time_s (${startS}) is after end_time_s (${endS})`,
      'Both are seconds since the pull, so start_time_s must be the smaller value.',
    );
  }

  return { startTime, endTime, pullTimestamp: fight.startTime, isPartial };
}

export function isToolError(value: unknown): value is ToolError {
  return typeof value === 'object' && value !== null && 'error' in value;
}

/** Fetch fight timings and resolve a requested window against them. */
export async function resolveWindow(
  client: WCLClient,
  reportCode: string,
  fightIds: number[],
  startS?: number,
  endS?: number,
): Promise<ResolvedWindow | ToolError> {
  if (fightIds.length !== 1) {
    return makeError(
      'window_needs_single_fight',
      `A time window applies to one fight, but ${fightIds.length} fight IDs were given`,
      'Pass exactly one fight ID when using start_time_s / end_time_s.',
    );
  }

  const data = await client.query<{
    reportData: { report: { fights: FightTimes[] } };
  }>(FIGHT_TIMES_QUERY, { code: reportCode, fightIDs: fightIds });

  const fight = data.reportData.report.fights.find(f => f.id === fightIds[0]);
  if (!fight) {
    return makeError(
      'fight_not_found',
      `Fight ${fightIds[0]} not found in report ${reportCode}`,
      'Check the fight ID. Use get_recent_reports to find valid fight IDs.',
    );
  }

  return computeWindow(fight, startS, endS);
}

/** Cache-key fragment so windowed and full-fight results never collide. */
export function windowKeySuffix(startS?: number, endS?: number): string {
  if (startS === undefined && endS === undefined) return '';
  return `:w${startS ?? ''}-${endS ?? ''}`;
}
