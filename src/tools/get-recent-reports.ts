import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { RECENT_REPORTS_QUERY, type WCLCharacter, type WCLReport, type WCLFight } from '../wcl/queries.js';
import { getActiveCharacter } from '../session/context.js';
import { reportDiscoveryKey } from '../session/cache.js';
import { realmToSlug } from '../utils/realm.js';
import { normalizeRegion } from '../utils/region.js';
import { logger } from '../utils/logger.js';
import { noActiveCharacter, characterNotFound, authFailure, serviceUnavailable, formatDuration, type ToolError } from '../formatters/common.js';

export const getRecentReportsSchema = z.object({
  name: z.string().optional().describe('Character name (defaults to active character)'),
  realm: z.string().optional().describe('Realm name or slug (defaults to active character)'),
  region: z.string().optional().describe('Region: us, eu, kr, tw (defaults to active character)'),
  limit: z.number().min(1).max(50).optional().default(10).describe('Number of reports to return (default 10)'),
  content_type: z.enum(['raid', 'mythicplus']).optional().describe('Filter to raid or mythicplus'),
});

export type GetRecentReportsArgs = z.infer<typeof getRecentReportsSchema>;

interface FormattedFight {
  id: number;
  name: string;
  duration: string;
  kill: boolean;
  keystoneLevel?: number;
  difficulty?: number;
  fightPercentage?: number;
}

interface FormattedReport {
  code: string;
  title: string;
  date: string;
  owner: string;
  fights: FormattedFight[];
}

interface RecentReportsResult {
  character: string;
  realm: string;
  region: string;
  reportCount: number;
  reports: FormattedReport[];
}

export async function handleGetRecentReports(
  client: WCLClient,
  args: GetRecentReportsArgs,
): Promise<RecentReportsResult | ToolError> {
  const startTime = Date.now();

  const active = getActiveCharacter();
  const name = (args.name ?? active?.name)?.trim();
  const rawRealm = args.realm ?? active?.realm;
  const rawRegion = args.region ?? active?.region;

  if (!name || !rawRealm || !rawRegion) {
    return noActiveCharacter();
  }

  const realm = realmToSlug(rawRealm);
  let region: string;
  try {
    region = normalizeRegion(rawRegion);
  } catch {
    return {
      error: 'invalid_region',
      message: `Invalid region "${rawRegion}"`,
      suggestion: 'Valid regions: us, eu, kr, tw.',
    } as ToolError;
  }

  const limit = args.limit ?? 10;
  const cacheKey = reportDiscoveryKey(name, realm, region);
  logger.toolCall('get_recent_reports', { name, realm, region, limit, content_type: args.content_type });

  try {
    const data = await client.query<{ characterData: { character: WCLCharacter | null } }>(
      RECENT_REPORTS_QUERY,
      { name, serverSlug: realm, serverRegion: region, limit },
      cacheKey,
    );

    const character = data.characterData.character;

    if (!character) {
      logger.toolResult('get_recent_reports', { success: true, latencyMs: Date.now() - startTime });
      return characterNotFound(name, realm, region);
    }

    let reports = character.recentReports.data;

    // Filter by content type if specified
    if (args.content_type) {
      reports = reports.map(report => ({
        ...report,
        fights: report.fights.filter(fight => {
          if (args.content_type === 'mythicplus') return !!fight.keystoneLevel;
          if (args.content_type === 'raid') return !fight.keystoneLevel && fight.difficulty && fight.difficulty >= 1;
          return true;
        }),
      })).filter(report => report.fights.length > 0);
    }

    const formattedReports: FormattedReport[] = reports.map(report => ({
      code: report.code,
      title: report.title,
      date: new Date(report.startTime).toISOString().split('T')[0],
      owner: report.owner.name,
      fights: report.fights.map(fight => {
        const formatted: FormattedFight = {
          id: fight.id,
          name: fight.name,
          duration: formatDuration(fight.endTime - fight.startTime),
          kill: !!fight.kill,
        };
        if (fight.keystoneLevel) formatted.keystoneLevel = fight.keystoneLevel;
        if (fight.difficulty) formatted.difficulty = fight.difficulty;
        if (fight.fightPercentage !== undefined && fight.fightPercentage !== null) {
          formatted.fightPercentage = fight.fightPercentage;
        }
        return formatted;
      }),
    }));

    logger.toolResult('get_recent_reports', { success: true, latencyMs: Date.now() - startTime });

    return {
      character: character.name,
      realm,
      region,
      reportCount: formattedReports.length,
      reports: formattedReports,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_recent_reports', { success: false, latencyMs, error: String(error) });
    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
      if (error.code === 'service_unavailable') return serviceUnavailable();
    }
    return serviceUnavailable();
  }
}
