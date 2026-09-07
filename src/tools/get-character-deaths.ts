import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { RECENT_REPORTS_QUERY, FIGHT_TABLE_QUERY, type WCLCharacter, type WCLDeathEntry } from '../wcl/queries.js';
import { getActiveCharacter } from '../session/context.js';
import { reportDiscoveryKey, fightTableKey } from '../session/cache.js';
import { realmToSlug } from '../utils/realm.js';
import { normalizeRegion } from '../utils/region.js';
import { logger } from '../utils/logger.js';
import { formatDeathsTable, aggregateDeaths, type DeathAggregation } from '../formatters/deaths.js';
import { characterNameRequired, noActiveCharacter, characterNotFound, authFailure, serviceUnavailable, type ToolError } from '../formatters/common.js';

export const getCharacterDeathsSchema = z.object({
  name: z.string().optional().describe('Character name (defaults to active character)'),
  realm: z.string().optional().describe('Realm (defaults to active character)'),
  region: z.string().optional().describe('Region (defaults to active character)'),
  report_code: z.string().optional().describe('Limit to a specific report'),
  fight_ids: z.array(z.number()).optional().describe('Limit to specific fights'),
  content_type: z.enum(['raid', 'mythicplus']).optional().describe('Filter by content type'),
  limit_reports: z.number().min(1).max(20).optional().default(5).describe('Max reports to scan (default 5)'),
});

export type GetCharacterDeathsArgs = z.infer<typeof getCharacterDeathsSchema>;

interface CharacterDeathsResult extends DeathAggregation {
  character: string;
  realm: string;
  region: string;
  reportsAnalyzed: number;
  fightsAnalyzed: number;
  averageDeathsPerFight: number;
}

export async function handleGetCharacterDeaths(
  client: WCLClient,
  args: GetCharacterDeathsArgs,
): Promise<CharacterDeathsResult | ToolError> {
  const startTime = Date.now();

  const active = getActiveCharacter();
  const name = (args.name ?? active?.name)?.trim();
  const rawRealm = args.realm ?? active?.realm;
  const rawRegion = args.region ?? active?.region;

  // Report discovery is the only step that needs a realm and region. When the
  // caller already names the report and fights, the character identity is just
  // a name to match inside that report's table.
  const reportIsScoped = Boolean(args.report_code && args.fight_ids?.length);

  if (!name) return reportIsScoped ? characterNameRequired() : noActiveCharacter();
  if (!reportIsScoped && (!rawRealm || !rawRegion)) return noActiveCharacter();

  let realm = '';
  let region = '';
  if (rawRealm && rawRegion) {
    realm = realmToSlug(rawRealm);
    try {
      region = normalizeRegion(rawRegion);
    } catch {
      return { error: 'invalid_region', message: `Invalid region "${rawRegion}"`, suggestion: 'Valid regions: us, eu, kr, tw.' } as ToolError;
    }
  }

  logger.toolCall('get_character_deaths', { name, realm, region, report_code: args.report_code, content_type: args.content_type });

  try {
    // Step 1: Get fight IDs to analyze
    let fightTargets: Array<{ reportCode: string; fightIds: number[] }>;

    if (args.report_code && args.fight_ids) {
      fightTargets = [{ reportCode: args.report_code, fightIds: args.fight_ids }];
    } else if (args.report_code) {
      // Get all fights from this report
      const reportData = await client.query<{ characterData: { character: WCLCharacter | null } }>(
        RECENT_REPORTS_QUERY,
        { name, serverSlug: realm, serverRegion: region, limit: args.limit_reports ?? 5 },
        reportDiscoveryKey(name, realm, region),
      );
      const character = reportData.characterData.character;
      if (!character) return characterNotFound(name, realm, region);

      const report = character.recentReports.data.find(r => r.code === args.report_code);
      if (!report) return { error: 'report_not_found', message: `Report ${args.report_code} not found`, suggestion: 'Check the report code.' } as ToolError;

      fightTargets = [{ reportCode: report.code, fightIds: filterFights(report.fights, args.content_type) }];
    } else {
      // Discover reports for this character
      const reportData = await client.query<{ characterData: { character: WCLCharacter | null } }>(
        RECENT_REPORTS_QUERY,
        { name, serverSlug: realm, serverRegion: region, limit: args.limit_reports ?? 5 },
        reportDiscoveryKey(name, realm, region),
      );
      const character = reportData.characterData.character;
      if (!character) return characterNotFound(name, realm, region);

      fightTargets = character.recentReports.data
        .map(report => ({
          reportCode: report.code,
          fightIds: filterFights(report.fights, args.content_type),
        }))
        .filter(t => t.fightIds.length > 0);
    }

    if (fightTargets.length === 0) {
      return {
        character: name,
        realm,
        region,
        totalDeaths: 0,
        deathsByAbility: [],
        deathsByPlayer: [],
        deaths: [],
        reportsAnalyzed: 0,
        fightsAnalyzed: 0,
        averageDeathsPerFight: 0,
      };
    }

    // Step 2: Fetch deaths from each report
    const allAggregations: DeathAggregation[] = [];
    let totalFights = 0;

    for (const target of fightTargets) {
      const cacheKey = fightTableKey(target.reportCode, target.fightIds[0], `Deaths:${target.fightIds.join(',')}`);
      const data = await client.query<{
        reportData: { report: { table: { data: { entries: WCLDeathEntry[]; totalTime: number } } } }
      }>(
        FIGHT_TABLE_QUERY,
        { code: target.reportCode, fightIDs: target.fightIds, dataType: 'Deaths' },
        cacheKey,
      );

      const deaths = formatDeathsTable(data.reportData.report.table.data.entries, name);
      allAggregations.push(deaths);
      totalFights += target.fightIds.length;
    }

    const aggregated = aggregateDeaths(allAggregations);

    logger.toolResult('get_character_deaths', { success: true, latencyMs: Date.now() - startTime });

    return {
      ...aggregated,
      character: name,
      realm,
      region,
      reportsAnalyzed: fightTargets.length,
      fightsAnalyzed: totalFights,
      averageDeathsPerFight: totalFights > 0 ? Math.round(aggregated.totalDeaths / totalFights * 10) / 10 : 0,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_character_deaths', { success: false, latencyMs, error: String(error) });
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
