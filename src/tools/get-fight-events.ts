import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { FIGHT_EVENTS_QUERY } from '../wcl/queries.js';
import { withAbilityNames, withRelativeTime, type RawEvent } from '../formatters/events.js';
import { resolveActorId, suggestActorNames } from '../wcl/actors.js';
import { logger } from '../utils/logger.js';
import { authFailure, serviceUnavailable, type ToolError } from '../formatters/common.js';

export const getFightEventsSchema = z.object({
  report_code: z.string().describe('WCL report code'),
  fight_id: z.number().describe('Fight ID'),
  event_type: z.enum(['casts', 'damage-done', 'damage-taken', 'healing', 'buffs', 'debuffs', 'deaths']).optional().describe('Event type filter'),
  source_name: z.string().optional().describe('Filter by source name (player or NPC), applied server-side. Includes the actor\'s pets, whose events carry sourceOwnerName.'),
  target_name: z.string().optional().describe('Filter by target name (player or NPC), applied server-side'),
  ability_id: z.number().optional().describe('Filter by ability ID'),
  page_token: z.number().optional().describe('Resume from a previous response\'s nextPageToken'),
  max_pages: z.number().min(1).max(20).optional().default(1).describe('Pages to follow automatically (default 1, max 20)'),
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
          petOwner
        }
        abilities {
          gameID
          name
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
          masterData: {
            actors: Array<{ id: number; name: string; type: string; petOwner?: number | null }>;
            abilities: Array<{ gameID: number; name: string }>;
          };
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

    // Build actor ID->name and ability ID->name maps for enriching events later
    const actorMap = new Map(report.masterData.actors.map(a => [a.id, a.name]));
    // Pet -> owner, so pet damage is attributable to the player it belongs to.
    const petOwnerMap = new Map(
      report.masterData.actors
        .filter(a => a.petOwner != null)
        .map(a => [a.id, actorMap.get(a.petOwner as number)] as const),
    );
    const abilityMap = new Map(
      (report.masterData.abilities ?? []).map(a => [a.gameID, a.name] as const),
    );

    // Resolve name filters to actor IDs so the API does the filtering. Filtering
    // client-side used to mean paging in raid-wide events and throwing most of
    // them away, which also made `hasMore` describe the unfiltered stream.
    //
    // Note: a sourceID filter is owner-scoped -- WCL also returns the actor's
    // pets, which is what you want for damage attribution. Those events carry
    // sourceOwnerName so the attribution stays visible.
    const actors = report.masterData.actors;
    const ambiguous: Record<string, string[]> = {};

    const variables: Record<string, unknown> = {
      code: args.report_code,
      fightID: args.fight_id,
      startTime: fight.startTime,
      endTime: fight.endTime,
    };

    for (const [argName, variable] of [
      ['source_name', 'sourceID'],
      ['target_name', 'targetID'],
    ] as const) {
      const wanted = args[argName];
      if (!wanted) continue;

      const { id, matches } = resolveActorId(actors, wanted);
      if (id === undefined) {
        return {
          error: 'actor_not_found',
          message: `No actor named "${wanted}" in fight ${args.fight_id} of report ${args.report_code}`,
          suggestion: `Check the spelling. Actors in this report include: ${suggestActorNames(actors, wanted).join(', ')}`,
        } as ToolError;
      }
      if (matches.length > 1) {
        ambiguous[argName] = matches.map(m => `${m.name} (id ${m.id})`);
      }
      variables[variable] = id;
    }

    if (args.event_type) variables.dataType = EVENT_TYPE_MAP[args.event_type];
    if (args.ability_id) variables.abilityID = args.ability_id;

    if (args.page_token !== undefined
      && (args.page_token < fight.startTime || args.page_token > fight.endTime)) {
      return {
        error: 'invalid_page_token',
        message: `page_token ${args.page_token} is outside fight ${args.fight_id} (${fight.startTime}-${fight.endTime})`,
        suggestion: 'Pass the nextPageToken from a previous response for this same fight. It is an absolute report timestamp, not a relative time.',
      } as ToolError;
    }

    // Follow WCL's cursor for up to max_pages. Without this the caller could
    // see that more events existed but had no way to reach them.
    const maxPages = args.max_pages ?? 1;
    let cursor: number = args.page_token ?? fight.startTime;
    let nextPageToken: number | null = null;
    let pagesFetched = 0;
    const rawEvents: RawEvent[] = [];

    while (pagesFetched < maxPages) {
      const page = await client.query<{
        reportData: {
          report: {
            events: {
              data: RawEvent[];
              nextPageTimestamp: number | null;
            };
          };
        };
      }>(
        FIGHT_EVENTS_QUERY,
        { ...variables, startTime: cursor },
      );

      const { data, nextPageTimestamp } = page.reportData.report.events;
      rawEvents.push(...data);
      pagesFetched++;
      nextPageToken = nextPageTimestamp;

      if (nextPageTimestamp == null) break;
      cursor = nextPageTimestamp;
    }

    const events = rawEvents.map(e => {
      const ownerName = petOwnerMap.get(e.sourceID as number);
      return {
        ...e,
        sourceName: actorMap.get(e.sourceID as number),
        targetName: actorMap.get(e.targetID as number),
        ...(ownerName ? { sourceOwnerName: ownerName } : {}),
      };
    });

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
      ...(Object.keys(ambiguous).length > 0 ? { ambiguousNameFilters: ambiguous } : {}),
      pagesFetched,
      hasMore: nextPageToken !== null,
      nextPageToken,
      events: withAbilityNames(
        withRelativeTime(events, fight.startTime),
        abilityMap,
      ),
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
