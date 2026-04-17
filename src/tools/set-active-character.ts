import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { RECENT_REPORTS_QUERY, WCL_CLASSES, type WCLCharacter } from '../wcl/queries.js';
import { setActiveCharacter } from '../session/context.js';
import { reportDiscoveryKey } from '../session/cache.js';
import { realmToSlug } from '../utils/realm.js';
import { normalizeRegion } from '../utils/region.js';
import { logger } from '../utils/logger.js';
import { titleCase, authFailure, serviceUnavailable, characterNotFound, type ToolError } from '../formatters/common.js';

export const setActiveCharacterSchema = z.object({
  name: z.string().describe('Character name'),
  realm: z.string().describe('Realm name or slug'),
  region: z.string().describe('Region: us, eu, kr, tw'),
});

export type SetActiveCharacterArgs = z.infer<typeof setActiveCharacterSchema>;

interface SetActiveCharacterResult {
  name: string;
  realm: string;
  region: string;
  class?: string;
  hasLogs: boolean;
  reportCount: number;
  mostRecentReport?: string;
}

export async function handleSetActiveCharacter(
  client: WCLClient,
  args: SetActiveCharacterArgs,
): Promise<SetActiveCharacterResult | ToolError> {
  const startTime = Date.now();
  const realm = realmToSlug(args.realm);

  let region: string;
  try {
    region = normalizeRegion(args.region);
  } catch {
    return {
      error: 'invalid_region',
      message: `Invalid region "${args.region}"`,
      suggestion: 'Valid regions: us, eu, kr, tw. Common aliases: na -> us, europe -> eu.',
    } as ToolError;
  }

  const name = args.name.trim();
  const cacheKey = reportDiscoveryKey(name, realm, region);

  logger.toolCall('set_active_character', { name, realm, region });

  try {
    const data = await client.query<{ characterData: { character: WCLCharacter | null } }>(
      RECENT_REPORTS_QUERY,
      { name, serverSlug: realm, serverRegion: region, limit: 1 },
      cacheKey,
    );

    const character = data.characterData.character;

    if (!character) {
      logger.toolResult('set_active_character', { success: true, latencyMs: Date.now() - startTime });
      setActiveCharacter({ name, realm, region, hasLogs: false });
      return characterNotFound(name, realm, region);
    }

    const className = WCL_CLASSES[character.classID];
    const reports = character.recentReports.data;
    const hasLogs = reports.length > 0;

    // Detect spec from most recent fight's player icon if possible
    let spec: string | undefined;
    if (reports.length > 0 && reports[0].fights.length > 0) {
      // We'll detect spec from fight data later; for now just class
    }

    setActiveCharacter({
      name: character.name,
      realm,
      region,
      class: className,
      spec,
      hasLogs,
    });

    const result: SetActiveCharacterResult = {
      name: character.name,
      realm,
      region,
      class: className,
      hasLogs,
      reportCount: reports.length,
    };

    if (reports.length > 0) {
      result.mostRecentReport = new Date(reports[0].endTime).toISOString().split('T')[0];
    }

    logger.toolResult('set_active_character', { success: true, latencyMs: Date.now() - startTime });
    return result;
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('set_active_character', { success: false, latencyMs, error: String(error) });

    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
      if (error.code === 'service_unavailable') return serviceUnavailable();
    }
    return serviceUnavailable();
  }
}
