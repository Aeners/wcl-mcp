import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { FIGHT_TABLE_QUERY } from '../wcl/queries.js';
import { fightTableKey } from '../session/cache.js';
import { resolveWindow, isToolError, windowKeySuffix } from '../wcl/window.js';
import { FIGHT_ACTORS_QUERY, resolveActorId, suggestActorNames, type ActorRef } from '../wcl/actors.js';
import { logger } from '../utils/logger.js';
import { formatBuffAuras, type AuraEntry, type WCLAura } from '../formatters/buffs.js';
import { authFailure, serviceUnavailable, type ToolError } from '../formatters/common.js';

export const getBuffUptimeSchema = z.object({
  report_code: z.string().describe('WCL report code'),
  fight_ids: z.array(z.number()).min(1).describe('Fight IDs to analyze'),
  player_name: z.string().optional().describe('Filter to a specific player'),
  buff_type: z.enum(['buffs', 'debuffs', 'both']).optional().default('both').describe('Type of buffs to fetch'),
  start_time_s: z.number().optional().describe('Window start, in seconds since the pull (single fight only)'),
  end_time_s: z.number().optional().describe('Window end, in seconds since the pull (single fight only)'),
});

export type GetBuffUptimeArgs = z.infer<typeof getBuffUptimeSchema>;

interface BuffUptimeResult {
  reportCode: string;
  fightIds: number[];
  buffType: string;
  playerName?: string;
  auras: AuraEntry[];
}

export async function handleGetBuffUptime(
  client: WCLClient,
  args: GetBuffUptimeArgs,
): Promise<BuffUptimeResult | ToolError> {
  const startTime = Date.now();
  logger.toolCall('get_buff_uptime', { report_code: args.report_code, fight_ids: args.fight_ids, buff_type: args.buff_type });

  try {
    const buffType = args.buff_type ?? 'both';
    const allAuras: AuraEntry[] = [];

    // Resolve the player to an actor ID -- the Buffs table accepts sourceID, so
    // this is a real filter rather than a raid-wide dump the caller has to sift.
    let sourceID: number | undefined;
    if (args.player_name) {
      const actorData = await client.query<{
        reportData: { report: { masterData: { actors: ActorRef[] } } };
      }>(FIGHT_ACTORS_QUERY, { code: args.report_code }, `${args.report_code}:actors`);

      const actors = actorData.reportData.report.masterData.actors;
      const { id } = resolveActorId(actors, args.player_name);
      if (id === undefined) {
        return {
          error: 'actor_not_found',
          message: `No actor named "${args.player_name}" in report ${args.report_code}`,
          suggestion: `Check the spelling. Actors in this report include: ${suggestActorNames(actors, args.player_name).join(', ')}`,
        } as ToolError;
      }
      sourceID = id;
    }

    const windowed = args.start_time_s !== undefined || args.end_time_s !== undefined;
    const window = windowed
      ? await resolveWindow(client, args.report_code, args.fight_ids, args.start_time_s, args.end_time_s)
      : undefined;
    if (window && isToolError(window)) return window;

    if (buffType === 'buffs' || buffType === 'both') {
      const cacheKey = fightTableKey(
        args.report_code,
        args.fight_ids[0],
        `Buffs:${args.fight_ids.join(',')}${windowKeySuffix(args.start_time_s, args.end_time_s)}${sourceID !== undefined ? `:s${sourceID}` : ''}`,
      );
      const data = await client.query<{
        reportData: { report: { table: { data: { auras: WCLAura[]; totalTime: number } } } }
      }>(
        FIGHT_TABLE_QUERY,
        {
          code: args.report_code,
          fightIDs: args.fight_ids,
          dataType: 'Buffs',
          startTime: window?.startTime,
          endTime: window?.endTime,
          sourceID,
        },
        cacheKey,
      );
      const tableData = data.reportData.report.table.data;
      const formatted = formatBuffAuras(tableData.auras ?? [], tableData.totalTime);
      allAuras.push(...formatted.auras);
    }

    if (buffType === 'debuffs' || buffType === 'both') {
      const cacheKey = fightTableKey(
        args.report_code,
        args.fight_ids[0],
        `Debuffs:${args.fight_ids.join(',')}${windowKeySuffix(args.start_time_s, args.end_time_s)}${sourceID !== undefined ? `:s${sourceID}` : ''}`,
      );
      const data = await client.query<{
        reportData: { report: { table: { data: { auras: WCLAura[]; totalTime: number } } } }
      }>(
        FIGHT_TABLE_QUERY,
        {
          code: args.report_code,
          fightIDs: args.fight_ids,
          dataType: 'Debuffs',
          startTime: window?.startTime,
          endTime: window?.endTime,
          sourceID,
        },
        cacheKey,
      );
      const tableData = data.reportData.report.table.data;
      const formatted = formatBuffAuras(tableData.auras ?? [], tableData.totalTime);
      allAuras.push(...formatted.auras);
    }

    // Sort all auras by uptime descending
    allAuras.sort((a, b) => b.uptimePct - a.uptimePct);

    logger.toolResult('get_buff_uptime', { success: true, latencyMs: Date.now() - startTime });

    return {
      reportCode: args.report_code,
      fightIds: args.fight_ids,
      buffType,
      ...(args.player_name ? { playerName: args.player_name } : {}),
      auras: allAuras,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_buff_uptime', { success: false, latencyMs, error: String(error) });
    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
    }
    return serviceUnavailable(String(error));
  }
}
