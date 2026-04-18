import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { RECENT_REPORTS_QUERY, FIGHT_TABLE_QUERY, type WCLCharacter, type WCLTableEntry } from '../wcl/queries.js';
import { getActiveCharacter } from '../session/context.js';
import { reportDiscoveryKey, fightTableKey } from '../session/cache.js';
import { realmToSlug } from '../utils/realm.js';
import { normalizeRegion } from '../utils/region.js';
import { logger } from '../utils/logger.js';
import { formatCastsTable, aggregateCasts, type CastSummary } from '../formatters/casts.js';
import { noActiveCharacter, characterNotFound, authFailure, serviceUnavailable, type ToolError } from '../formatters/common.js';

export const getCharacterCastsSchema = z.object({
  name: z.string().optional().describe('Character name (defaults to active character)'),
  realm: z.string().optional().describe('Realm (defaults to active character)'),
  region: z.string().optional().describe('Region (defaults to active character)'),
  report_code: z.string().optional().describe('Limit to a specific report'),
  fight_ids: z.array(z.number()).optional().describe('Limit to specific fights'),
  content_type: z.enum(['raid', 'mythicplus']).optional().describe('Filter by content type'),
  limit_reports: z.number().min(1).max(20).optional().default(5).describe('Max reports to scan (default 5)'),
});

export type GetCharacterCastsArgs = z.infer<typeof getCharacterCastsSchema>;

interface CharacterCastsResult extends CastSummary {
  realm: string;
  region: string;
  reportsAnalyzed: number;
}

export async function handleGetCharacterCasts(
  client: WCLClient,
  args: GetCharacterCastsArgs,
): Promise<CharacterCastsResult | ToolError> {
  const startTime = Date.now();

  const active = getActiveCharacter();
  const name = (args.name ?? active?.name)?.trim();
  const rawRealm = args.realm ?? active?.realm;
  const rawRegion = args.region ?? active?.region;

  if (!name || !rawRealm || !rawRegion) return noActiveCharacter();

  const realm = realmToSlug(rawRealm);
  let region: string;
  try {
    region = normalizeRegion(rawRegion);
  } catch {
    return { error: 'invalid_region', message: `Invalid region "${rawRegion}"`, suggestion: 'Valid regions: us, eu, kr, tw.' } as ToolError;
  }

  logger.toolCall('get_character_casts', { name, realm, region, report_code: args.report_code, content_type: args.content_type });

  try {
    // Step 1: Get fight targets
    let fightTargets: Array<{ reportCode: string; fightIds: number[] }>;

    if (args.report_code && args.fight_ids) {
      fightTargets = [{ reportCode: args.report_code, fightIds: args.fight_ids }];
    } else {
      const reportData = await client.query<{ characterData: { character: WCLCharacter | null } }>(
        RECENT_REPORTS_QUERY,
        { name, serverSlug: realm, serverRegion: region, limit: args.limit_reports ?? 5 },
        reportDiscoveryKey(name, realm, region),
      );
      const character = reportData.characterData.character;
      if (!character) return characterNotFound(name, realm, region);

      if (args.report_code) {
        const report = character.recentReports.data.find(r => r.code === args.report_code);
        if (!report) return { error: 'report_not_found', message: `Report ${args.report_code} not found`, suggestion: 'Check the report code.' } as ToolError;
        fightTargets = [{ reportCode: report.code, fightIds: filterFights(report.fights, args.content_type) }];
      } else {
        fightTargets = character.recentReports.data
          .map(report => ({
            reportCode: report.code,
            fightIds: filterFights(report.fights, args.content_type),
          }))
          .filter(t => t.fightIds.length > 0);
      }
    }

    if (fightTargets.length === 0) {
      return {
        playerName: name,
        classSpec: '',
        fightsAnalyzed: 0,
        abilities: [],
        realm,
        region,
        reportsAnalyzed: 0,
      };
    }

    // Step 2: Fetch casts from each report's fights
    const perFightData: Array<Array<{ name: string; classSpec: string; abilities: Array<{ name: string; total: number }> }>> = [];

    for (const target of fightTargets) {
      // Fetch each fight individually for proper per-fight averaging
      for (const fightId of target.fightIds) {
        const cacheKey = fightTableKey(target.reportCode, fightId, 'Casts');
        const data = await client.query<{
          reportData: { report: { table: { data: { entries: WCLTableEntry[]; totalTime: number } } } }
        }>(
          FIGHT_TABLE_QUERY,
          { code: target.reportCode, fightIDs: [fightId], dataType: 'Casts' },
          cacheKey,
        );

        const formatted = formatCastsTable(data.reportData.report.table.data.entries, name);
        perFightData.push(formatted);
      }
    }

    const summary = aggregateCasts(perFightData, name);

    logger.toolResult('get_character_casts', { success: true, latencyMs: Date.now() - startTime });

    return {
      ...summary,
      realm,
      region,
      reportsAnalyzed: fightTargets.length,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_character_casts', { success: false, latencyMs, error: String(error) });
    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
    }
    return serviceUnavailable(String(error));
  }
}

function filterFights(fights: Array<{ id: number; keystoneLevel?: number; difficulty?: number }>, contentType?: string): number[] {
  return fights
    .filter(f => {
      if (contentType === 'mythicplus') return !!f.keystoneLevel;
      if (contentType === 'raid') return !f.keystoneLevel && f.difficulty && f.difficulty >= 1;
      return true;
    })
    .map(f => f.id);
}
