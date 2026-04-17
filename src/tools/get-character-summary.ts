import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { RECENT_REPORTS_QUERY, WCL_CLASSES, type WCLCharacter } from '../wcl/queries.js';
import { getActiveCharacter } from '../session/context.js';
import { reportDiscoveryKey } from '../session/cache.js';
import { realmToSlug } from '../utils/realm.js';
import { normalizeRegion } from '../utils/region.js';
import { logger } from '../utils/logger.js';
import { noActiveCharacter, characterNotFound, authFailure, serviceUnavailable, titleCase, type ToolError } from '../formatters/common.js';

export const getCharacterSummarySchema = z.object({
  name: z.string().optional().describe('Character name (defaults to active character)'),
  realm: z.string().optional().describe('Realm name or slug (defaults to active character)'),
  region: z.string().optional().describe('Region: us, eu, kr, tw (defaults to active character)'),
});

export type GetCharacterSummaryArgs = z.infer<typeof getCharacterSummarySchema>;

interface CharacterSummaryResult {
  name: string;
  realm: string;
  region: string;
  class?: string;
  hasLogs: boolean;
  reportCount: number;
  mostRecentReport?: string;
  contentTypes: {
    mythicPlus: number;
    raid: number;
    other: number;
  };
}

export async function handleGetCharacterSummary(
  client: WCLClient,
  args: GetCharacterSummaryArgs,
): Promise<CharacterSummaryResult | ToolError> {
  const startTime = Date.now();

  // Resolve character identity
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

  const cacheKey = reportDiscoveryKey(name, realm, region);
  logger.toolCall('get_character_summary', { name, realm, region });

  try {
    const data = await client.query<{ characterData: { character: WCLCharacter | null } }>(
      RECENT_REPORTS_QUERY,
      { name, serverSlug: realm, serverRegion: region, limit: 10 },
      cacheKey,
    );

    const character = data.characterData.character;

    if (!character) {
      logger.toolResult('get_character_summary', { success: true, latencyMs: Date.now() - startTime });
      return characterNotFound(name, realm, region);
    }

    const reports = character.recentReports.data;
    const className = WCL_CLASSES[character.classID];

    // Count content types
    let mythicPlus = 0;
    let raid = 0;
    let other = 0;
    for (const report of reports) {
      for (const fight of report.fights) {
        if (fight.keystoneLevel) {
          mythicPlus++;
        } else if (fight.difficulty && fight.difficulty >= 1) {
          raid++;
        } else {
          other++;
        }
      }
    }

    const result: CharacterSummaryResult = {
      name: character.name,
      realm,
      region,
      class: className,
      hasLogs: reports.length > 0,
      reportCount: reports.length,
      contentTypes: { mythicPlus, raid, other },
    };

    if (reports.length > 0) {
      result.mostRecentReport = new Date(reports[0].endTime).toISOString().split('T')[0];
    }

    logger.toolResult('get_character_summary', { success: true, latencyMs: Date.now() - startTime });
    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_character_summary', { success: false, latencyMs, error: String(error) });
    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
      if (error.code === 'service_unavailable') return serviceUnavailable();
    }
    return serviceUnavailable();
  }
}
