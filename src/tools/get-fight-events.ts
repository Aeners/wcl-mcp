import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { FIGHT_SUMMARY_QUERY, FIGHT_EVENTS_QUERY } from '../wcl/queries.js';
import { logger } from '../utils/logger.js';
import { authFailure, serviceUnavailable, type ToolError } from '../formatters/common.js';

export const getFightEventsSchema = z.object({
  report_code: z.string().describe('WCL report code'),
  fight_id: z.number().describe('Fight ID'),
  event_type: z.enum(['casts', 'damage-done', 'damage-taken', 'healing', 'buffs', 'debuffs', 'deaths']).optional().describe('Event type filter'),
  source_name: z.string().optional().describe('Filter by source player name'),
  target_name: z.string().optional().describe('Filter by target name'),
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
    // First, get fight timing info
    const fightData = await client.query<{
      reportData: {
        report: {
          fights: Array<{ id: number; name: string; startTime: number; endTime: number }>;
          masterData: { actors: Array<{ id: number; name: string; type: string; subType: string; icon: string }> };
        };
      };
    }>(
      FIGHT_SUMMARY_QUERY,
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

    // Resolve source/target names to IDs
    let sourceID: number | undefined;
    let targetID: number | undefined;

    if (args.source_name) {
      const actor = report.masterData.actors.find(
        a => a.name.toLowerCase() === args.source_name!.toLowerCase()
      );
      if (actor) sourceID = actor.id;
    }

    if (args.target_name) {
      const actor = report.masterData.actors.find(
        a => a.name.toLowerCase() === args.target_name!.toLowerCase()
      );
      if (actor) targetID = actor.id;
    }

    // Build events query variables
    const variables: Record<string, unknown> = {
      code: args.report_code,
      fightID: args.fight_id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };

    if (args.event_type) variables.dataType = EVENT_TYPE_MAP[args.event_type];
    if (sourceID !== undefined) variables.sourceID = sourceID;
    if (targetID !== undefined) variables.targetID = targetID;
    if (args.ability_id) variables.abilityID = args.ability_id;

    const eventsData = await client.query<{
      reportData: {
        report: {
          events: {
            data: unknown[];
            nextPageTimestamp: number | null;
          };
        };
      };
    }>(
      FIGHT_EVENTS_QUERY,
      variables,
    );

    const events = eventsData.reportData.report.events;

    logger.toolResult('get_fight_events', { success: true, latencyMs: Date.now() - startTime });

    return {
      reportCode: args.report_code,
      fightId: args.fight_id,
      fightName: fight.name,
      eventType: args.event_type ?? 'all',
      eventCount: events.data.length,
      hasMore: events.nextPageTimestamp !== null,
      nextPageTimestamp: events.nextPageTimestamp,
      events: events.data,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_fight_events', { success: false, latencyMs, error: String(error) });
    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
    }
    return serviceUnavailable();
  }
}
