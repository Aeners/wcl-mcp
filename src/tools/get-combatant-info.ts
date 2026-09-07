import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { COMBATANT_INFO_QUERY, type WCLActor } from '../wcl/queries.js';
import { combatantKey } from '../session/cache.js';
import { logger } from '../utils/logger.js';
import { authFailure, serviceUnavailable, type ToolError } from '../formatters/common.js';
import { filterSummaryToPlayer } from '../formatters/combatants.js';
import { resolveActorId, suggestActorNames } from '../wcl/actors.js';

export const getCombatantInfoSchema = z.object({
  report_code: z.string().describe('WCL report code'),
  fight_id: z.number().describe('Fight ID'),
  player_name: z.string().optional().describe('Filter to a specific player -- also narrows playerDetails, which is very large unfiltered'),
});

export type GetCombatantInfoArgs = z.infer<typeof getCombatantInfoSchema>;

interface CombatantInfoEntry {
  name: string;
  classSpec: string;
}

interface CombatantInfoResult {
  reportCode: string;
  fightId: number;
  combatants: CombatantInfoEntry[];
  playerDetails: unknown;
}

export async function handleGetCombatantInfo(
  client: WCLClient,
  args: GetCombatantInfoArgs,
): Promise<CombatantInfoResult | ToolError> {
  const startTime = Date.now();
  logger.toolCall('get_combatant_info', { report_code: args.report_code, fight_id: args.fight_id, player_name: args.player_name });

  try {
    const cacheKey = combatantKey(args.report_code, args.fight_id);

    const data = await client.query<{
      reportData: {
        report: {
          masterData: { actors: WCLActor[] };
          fights: Array<{ id: number; name: string; startTime: number; endTime: number }>;
          playerDetails: { data: { entries: unknown[] } } | null;
        };
      };
    }>(
      COMBATANT_INFO_QUERY,
      { code: args.report_code, fightIDs: [args.fight_id] },
      cacheKey,
    );

    const report = data.reportData.report;
    const players = report.masterData.actors.filter(a => a.type === 'Player');

    let actors = players;
    if (args.player_name) {
      const { matches } = resolveActorId(players, args.player_name);
      if (matches.length === 0) {
        return {
          error: 'actor_not_found',
          message: `No player named "${args.player_name}" in fight ${args.fight_id} of report ${args.report_code}`,
          suggestion: `Check the spelling. Players in this report include: ${suggestActorNames(players, args.player_name).join(', ')}`,
        } as ToolError;
      }
      actors = matches as typeof players;
    }

    const combatants: CombatantInfoEntry[] = actors.map(a => ({
      name: a.name,
      classSpec: a.icon || a.subType,
    }));

    logger.toolResult('get_combatant_info', { success: true, latencyMs: Date.now() - startTime });

    return {
      reportCode: args.report_code,
      fightId: args.fight_id,
      combatants,
      // Filtering the Summary payload matters: unfiltered it runs to hundreds
      // of thousands of characters for a full raid.
      playerDetails: args.player_name
        ? filterSummaryToPlayer(report.playerDetails?.data ?? null, args.player_name)
        : report.playerDetails?.data ?? null,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_combatant_info', { success: false, latencyMs, error: String(error) });
    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
    }
    return serviceUnavailable(String(error));
  }
}
