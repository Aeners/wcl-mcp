import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { FIGHT_SUMMARY_QUERY, type WCLFight, type WCLActor, type WCLTableEntry, type WCLDeathEntry } from '../wcl/queries.js';
import { logger } from '../utils/logger.js';
import { authFailure, serviceUnavailable, formatDuration, computeDps, computeHps, type ToolError } from '../formatters/common.js';

export const getFightSummarySchema = z.object({
  report_code: z.string().describe('WCL report code'),
  fight_ids: z.array(z.number()).min(1).describe('Fight IDs to summarize'),
});

export type GetFightSummaryArgs = z.infer<typeof getFightSummarySchema>;

interface FightSummaryEntry {
  fightId: number;
  name: string;
  duration: string;
  durationMs: number;
  kill: boolean;
  keystoneLevel?: number;
  difficulty?: number;
  fightPercentage?: number;
  composition: Array<{ name: string; classSpec: string }>;
  totalDamage: number;
  totalHealing: number;
  totalDeaths: number;
  groupDps: number;
  groupHps: number;
  topDps: Array<{ name: string; classSpec: string; dps: number; total: number }>;
  topHealing: Array<{ name: string; classSpec: string; hps: number; total: number }>;
}

interface FightSummaryResult {
  reportCode: string;
  fights: FightSummaryEntry[];
}

interface SummaryQueryResponse {
  reportData: {
    report: {
      fights: WCLFight[];
      masterData: {
        actors: WCLActor[];
      };
      damageTable: { data: { entries: WCLTableEntry[]; totalTime: number } };
      healingTable: { data: { entries: WCLTableEntry[]; totalTime: number } };
      deathsTable: { data: { entries: WCLDeathEntry[]; totalTime: number } };
    };
  };
}

export async function handleGetFightSummary(
  client: WCLClient,
  args: GetFightSummaryArgs,
): Promise<FightSummaryResult | ToolError> {
  const startTime = Date.now();
  logger.toolCall('get_fight_summary', { report_code: args.report_code, fight_ids: args.fight_ids });

  try {
    // Use the batched summary query (aliases for damage, healing, deaths in one request)
    const data = await client.query<SummaryQueryResponse>(
      FIGHT_SUMMARY_QUERY,
      { code: args.report_code, fightIDs: args.fight_ids },
    );

    const report = data.reportData.report;
    const actors = report.masterData.actors;
    const actorMap = new Map(actors.map(a => [a.id, a]));

    const damageEntries = report.damageTable?.data?.entries ?? [];
    const healingEntries = report.healingTable?.data?.entries ?? [];
    const deathEntries = report.deathsTable?.data?.entries ?? [];
    const totalTime = report.damageTable?.data?.totalTime ?? 0;

    // Build per-fight summaries
    const fights: FightSummaryEntry[] = report.fights.map(fight => {
      const durationMs = fight.endTime - fight.startTime;

      // Build composition from actors
      const composition = actors
        .filter(a => a.type === 'Player')
        .map(a => ({ name: a.name, classSpec: a.icon || a.subType }));

      // Compute totals from table data
      const totalDamage = damageEntries.reduce((sum, e) => sum + e.total, 0);
      const totalHealing = healingEntries.reduce((sum, e) => sum + e.total, 0);
      const totalDeaths = deathEntries.length;

      // Top DPS
      const topDps = damageEntries
        .filter(e => e.type !== 'Pet')
        .map(e => ({
          name: e.name,
          classSpec: e.icon,
          dps: computeDps(e.total, e.activeTime ?? totalTime),
          total: e.total,
        }))
        .sort((a, b) => b.dps - a.dps)
        .slice(0, 5);

      // Top Healing
      const topHealing = healingEntries
        .filter(e => e.type !== 'Pet')
        .map(e => ({
          name: e.name,
          classSpec: e.icon,
          hps: computeHps(e.total, e.activeTime ?? totalTime),
          total: e.total,
        }))
        .sort((a, b) => b.hps - a.hps)
        .slice(0, 5);

      const entry: FightSummaryEntry = {
        fightId: fight.id,
        name: fight.name,
        duration: formatDuration(durationMs),
        durationMs,
        kill: !!fight.kill,
        composition,
        totalDamage,
        totalHealing,
        totalDeaths,
        groupDps: computeDps(totalDamage, totalTime),
        groupHps: computeHps(totalHealing, totalTime),
        topDps,
        topHealing,
      };

      if (fight.keystoneLevel) entry.keystoneLevel = fight.keystoneLevel;
      if (fight.difficulty) entry.difficulty = fight.difficulty;
      if (fight.fightPercentage !== undefined) entry.fightPercentage = fight.fightPercentage;

      return entry;
    });

    logger.toolResult('get_fight_summary', { success: true, latencyMs: Date.now() - startTime });

    return {
      reportCode: args.report_code,
      fights,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_fight_summary', { success: false, latencyMs, error: String(error) });
    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
      if (error.code === 'service_unavailable') return serviceUnavailable();
    }
    return serviceUnavailable();
  }
}
