import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { FIGHT_TABLE_QUERY, type WCLTableEntry } from '../wcl/queries.js';
import { fightTableKey } from '../session/cache.js';
import { resolveWindow, isToolError, windowKeySuffix } from '../wcl/window.js';
import { logger } from '../utils/logger.js';
import { formatDamageTable, type DamageEntry } from '../formatters/damage.js';
import { authFailure, serviceUnavailable, formatDuration, type ToolError } from '../formatters/common.js';

export const getFightDamageSchema = z.object({
  report_code: z.string().describe('WCL report code'),
  fight_ids: z.array(z.number()).min(1).describe('Fight IDs to analyze'),
  player_name: z.string().optional().describe('Filter to a specific player'),
  start_time_s: z.number().optional().describe('Window start, in seconds since the pull (single fight only)'),
  end_time_s: z.number().optional().describe('Window end, in seconds since the pull (single fight only)'),
});

export type GetFightDamageArgs = z.infer<typeof getFightDamageSchema>;

interface FightDamageResult {
  reportCode: string;
  fightIds: number[];
  totalTime: number;
  totalTimeFmt: string;
  entries: DamageEntry[];
}

export async function handleGetFightDamage(
  client: WCLClient,
  args: GetFightDamageArgs,
): Promise<FightDamageResult | ToolError> {
  const startTime = Date.now();
  logger.toolCall('get_fight_damage', { report_code: args.report_code, fight_ids: args.fight_ids, player_name: args.player_name });

  try {
    const windowed = args.start_time_s !== undefined || args.end_time_s !== undefined;
    const window = windowed
      ? await resolveWindow(client, args.report_code, args.fight_ids, args.start_time_s, args.end_time_s)
      : undefined;
    if (window && isToolError(window)) return window;

    const cacheKey = fightTableKey(
      args.report_code,
      args.fight_ids[0],
      `DamageDone:${args.fight_ids.join(',')}${windowKeySuffix(args.start_time_s, args.end_time_s)}`,
    );

    const data = await client.query<{
      reportData: { report: { table: { data: { entries: WCLTableEntry[]; totalTime: number } } } }
    }>(
      FIGHT_TABLE_QUERY,
      {
        code: args.report_code,
        fightIDs: args.fight_ids,
        dataType: 'DamageDone',
        startTime: window?.startTime,
        endTime: window?.endTime,
      },
      cacheKey,
    );

    const tableData = data.reportData.report.table.data;
    const entries = formatDamageTable(tableData.entries, tableData.totalTime, args.player_name);

    logger.toolResult('get_fight_damage', { success: true, latencyMs: Date.now() - startTime });

    return {
      reportCode: args.report_code,
      fightIds: args.fight_ids,
      totalTime: tableData.totalTime,
      totalTimeFmt: formatDuration(tableData.totalTime),
      entries,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_fight_damage', { success: false, latencyMs, error: String(error) });
    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
    }
    return serviceUnavailable(String(error));
  }
}
