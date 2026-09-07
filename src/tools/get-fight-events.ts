import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { FIGHT_EVENTS_QUERY } from '../wcl/queries.js';
import { withRelativeTime, type RawEvent } from '../formatters/events.js';
import { logger } from '../utils/logger.js';
import { authFailure, serviceUnavailable, type ToolError } from '../formatters/common.js';

export const getFightEventsSchema = z.object({
  report_code: z.string().describe('WCL report code'),
  fight_id: z.number().describe('Fight ID'),
  event_type: z.enum(['casts', 'damage-done', 'damage-taken', 'healing', 'buffs', 'debuffs', 'deaths']).optional().describe('Event type filter'),
  source_name: z.string().optional().describe('Filter by source player name (client-side filter)'),
  target_name: z.string().optional().describe('Filter by target name (client-side filter)'),
  ability_id: z.number().optional().describe('Filter by ability ID'),
});

export type GetFightEventsArgs = z.infer<typeof getFightEventsSchema>;

// Map user-friendly event types to WCL API dataTypes
const EVENT_TYPE_MAP: Record<string, string> = {
  'casts': 'Casts',
  'damage-done': 'DamageDone',
  'damage-taken': 'DamageTaken',
  'healing': 'Healing',
  'buffs': 'Buffs',
  'debuffs': 'Debuffs',
  'deaths': 'Deaths',
};

// Lightweight query to get fight timing + actor name mapping
const FIGHT_META_QUERY = `
query FightMeta($code: String!, $fightIDs: [Int]!) {
  reportData {
    report(code: $code) {
      fights(fightIDs: $fightIDs) {
        id
        name
        startTime
        endTime
      }
      masterData {
        actors {
          id
          name
          type
        }
      }
    }
  }
}
`;

export async function handleGetFightEvents(
  client: WCLClient,
  args: GetFightEventsArgs,
): Promise<unknown | ToolError> {
  const startTime = Date.now();
  logger.toolCall('get_fight_events', {
    report_code: args.report_code,
    fight_id: args.fight_id,
    event_type: args.event_type,
    source_name: args.source_name,
  });

  try {
    // Get fight timing and actor name map (lightweight query, no table data)
    const fightData = await client.query<{
      reportData: {
        report: {
          fights: Array<{ id: number; name: string; startTime: number; endTime: number }>;
          masterData: { actors: Array<{ id: number; name: string; type: string }> };
        };
      };
    }>(
      FIGHT_META_QUERY,
      { code: args.report_code, fightIDs: [args.fight_id] },
    );

    const report = fightData.reportData.report;
    const fight = report.fights.find(f => f.id === args.fight_id);
    if (!fight) {
      return {
        error: 'fight_not_found',
        message: `Fight ${args.fight_id} not found in report ${args.report_code}`,
        suggestion: 'Check the fight ID. Use get_recent_reports to find valid fight IDs.',
      } as ToolError;
    }

    // Build actor ID->name map for enriching events later
    const actorMap = new Map(report.masterData.actors.map(a => [a.id, a.name]));

    // Fetch events -- don't use sourceID/targetID params because
    // masterData actor IDs and event sourceIDs use different ID spaces.
    // We filter client-side instead.
    const variables: Record<string, unknown> = {
      code: args.report_code,
      fightID: args.fight_id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };

    if (args.event_type) variables.dataType = EVENT_TYPE_MAP[args.event_type];
    if (args.ability_id) variables.abilityID = args.ability_id;

    const eventsData = await client.query<{
      reportData: {
        report: {
          events: {
            data: Array<Record<string, unknown>>;
            nextPageTimestamp: number | null;
          };
        };
      };
    }>(
      FIGHT_EVENTS_QUERY,
      variables,
    );

    let events = eventsData.reportData.report.events.data;

    // Enrich events with actor names
    events = events.map(e => ({
      ...e,
      sourceName: actorMap.get(e.sourceID as number),
      targetName: actorMap.get(e.targetID as number),
    }));

    // Client-side filtering by source/target name
    if (args.source_name) {
      const filterName = args.source_name.toLowerCase();
      events = events.filter(e =>
        (e.sourceName as string)?.toLowerCase() === filterName
      );
    }
    if (args.target_name) {
      const filterName = args.target_name.toLowerCase();
      events = events.filter(e =>
        (e.targetName as string)?.toLowerCase() === filterName
      );
    }

    logger.toolResult('get_fight_events', { success: true, latencyMs: Date.now() - startTime });

    return {
      reportCode: args.report_code,
      fightId: args.fight_id,
      fightName: fight.name,
      // T0. Every `relativeTime` below is seconds since this timestamp, so
      // there is no need to reconstruct the pull from death events.
      pullTimestamp: fight.startTime,
      fightEndTimestamp: fight.endTime,
      fightDurationMs: fight.endTime - fight.startTime,
      eventType: args.event_type ?? 'all',
      eventCount: events.length,
      hasMore: eventsData.reportData.report.events.nextPageTimestamp !== null,
      nextPageTimestamp: eventsData.reportData.report.events.nextPageTimestamp,
      events: withRelativeTime(events as RawEvent[], fight.startTime),
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_fight_events', { success: false, latencyMs, error: String(error) });
    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
    }
    return serviceUnavailable(String(error));
  }
}
