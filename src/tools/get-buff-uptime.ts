import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { FIGHT_TABLE_QUERY, type WCLTableEntry } from '../wcl/queries.js';
import { fightTableKey } from '../session/cache.js';
import { logger } from '../utils/logger.js';
import { formatBuffTable, type BuffUptimeEntry } from '../formatters/buffs.js';
import { authFailure, serviceUnavailable, type ToolError } from '../formatters/common.js';

export const getBuffUptimeSchema = z.object({
  report_code: z.string().describe('WCL report code'),
  fight_ids: z.array(z.number()).min(1).describe('Fight IDs to analyze'),
  player_name: z.string().optional().describe('Filter to a specific player'),
  buff_type: z.enum(['buffs', 'debuffs', 'both']).optional().default('both').describe('Type of buffs to fetch'),
});

export type GetBuffUptimeArgs = z.infer<typeof getBuffUptimeSchema>;

interface BuffUptimeResult {
  reportCode: string;
  fightIds: number[];
  buffType: string;
  entries: BuffUptimeEntry[];
}

export async function handleGetBuffUptime(
  client: WCLClient,
  args: GetBuffUptimeArgs,
): Promise<BuffUptimeResult | ToolError> {
  const startTime = Date.now();
  logger.toolCall('get_buff_uptime', { report_code: args.report_code, fight_ids: args.fight_ids, player_name: args.player_name, buff_type: args.buff_type });

  try {
    const buffType = args.buff_type ?? 'both';
    const allEntries: BuffUptimeEntry[] = [];

    if (buffType === 'buffs' || buffType === 'both') {
      const cacheKey = fightTableKey(args.report_code, args.fight_ids[0], `Buffs:${args.fight_ids.join(',')}`);
      const data = await client.query<{
        reportData: { report: { table: { data: { entries: WCLTableEntry[]; totalTime: number } } } }
      }>(
        FIGHT_TABLE_QUERY,
        { code: args.report_code, fightIDs: args.fight_ids, dataType: 'Buffs' },
        cacheKey,
      );
      const tableData = data.reportData.report.table.data;
      allEntries.push(...formatBuffTable(tableData.entries, tableData.totalTime, args.player_name));
    }

    if (buffType === 'debuffs' || buffType === 'both') {
      const cacheKey = fightTableKey(args.report_code, args.fight_ids[0], `Debuffs:${args.fight_ids.join(',')}`);
      const data = await client.query<{
        reportData: { report: { table: { data: { entries: WCLTableEntry[]; totalTime: number } } } }
      }>(
        FIGHT_TABLE_QUERY,
        { code: args.report_code, fightIDs: args.fight_ids, dataType: 'Debuffs' },
        cacheKey,
      );
      const tableData = data.reportData.report.table.data;
      const debuffEntries = formatBuffTable(tableData.entries, tableData.totalTime, args.player_name);

      // Merge debuff entries with existing buff entries for the same player
      for (const debuffEntry of debuffEntries) {
        const existing = allEntries.find(e => e.playerName === debuffEntry.playerName);
        if (existing) {
          existing.buffs.push(...debuffEntry.buffs);
        } else {
          allEntries.push(debuffEntry);
        }
      }
    }

    logger.toolResult('get_buff_uptime', { success: true, latencyMs: Date.now() - startTime });

    return {
      reportCode: args.report_code,
      fightIds: args.fight_ids,
      buffType,
      entries: allEntries,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_buff_uptime', { success: false, latencyMs, error: String(error) });
    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
    }
    return serviceUnavailable();
  }
}
