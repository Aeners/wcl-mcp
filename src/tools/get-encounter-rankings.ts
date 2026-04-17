import { z } from 'zod';
import { WCLClient, WCLError } from '../wcl/client.js';
import { ENCOUNTER_RANKINGS_QUERY, ZONE_RANKINGS_QUERY } from '../wcl/queries.js';
import { getActiveCharacter } from '../session/context.js';
import { realmToSlug } from '../utils/realm.js';
import { normalizeRegion } from '../utils/region.js';
import { logger } from '../utils/logger.js';
import { noActiveCharacter, characterNotFound, authFailure, serviceUnavailable, type ToolError } from '../formatters/common.js';

export const getEncounterRankingsSchema = z.object({
  name: z.string().optional().describe('Character name (defaults to active character)'),
  realm: z.string().optional().describe('Realm (defaults to active character)'),
  region: z.string().optional().describe('Region (defaults to active character)'),
  encounter_id: z.number().optional().describe('Specific encounter ID'),
  zone_id: z.number().optional().describe('Zone ID for zone-wide rankings'),
  difficulty: z.number().optional().describe('Difficulty level'),
  metric: z.string().optional().describe('Metric: dps, hps, bossdps, etc.'),
});

export type GetEncounterRankingsArgs = z.infer<typeof getEncounterRankingsSchema>;

export async function handleGetEncounterRankings(
  client: WCLClient,
  args: GetEncounterRankingsArgs,
): Promise<unknown | ToolError> {
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

  logger.toolCall('get_encounter_rankings', { name, realm, region, encounter_id: args.encounter_id, zone_id: args.zone_id });

  try {
    if (args.zone_id) {
      const data = await client.query<{ characterData: { character: { zoneRankings: unknown } | null } }>(
        ZONE_RANKINGS_QUERY,
        {
          name,
          serverSlug: realm,
          serverRegion: region,
          zoneID: args.zone_id,
          difficulty: args.difficulty ?? null,
          metric: args.metric ?? null,
        },
      );

      if (!data.characterData.character) return characterNotFound(name, realm, region);

      logger.toolResult('get_encounter_rankings', { success: true, latencyMs: Date.now() - startTime });
      return {
        character: name,
        realm,
        region,
        type: 'zone',
        zoneId: args.zone_id,
        rankings: data.characterData.character.zoneRankings,
      };
    } else if (args.encounter_id) {
      const data = await client.query<{ characterData: { character: { encounterRankings: unknown } | null } }>(
        ENCOUNTER_RANKINGS_QUERY,
        {
          name,
          serverSlug: realm,
          serverRegion: region,
          encounterID: args.encounter_id,
          difficulty: args.difficulty ?? null,
          metric: args.metric ?? null,
        },
      );

      if (!data.characterData.character) return characterNotFound(name, realm, region);

      logger.toolResult('get_encounter_rankings', { success: true, latencyMs: Date.now() - startTime });
      return {
        character: name,
        realm,
        region,
        type: 'encounter',
        encounterId: args.encounter_id,
        rankings: data.characterData.character.encounterRankings,
      };
    } else {
      return {
        error: 'missing_args',
        message: 'Either encounter_id or zone_id must be provided.',
        suggestion: 'Provide encounter_id for a specific boss or zone_id for zone-wide rankings. Check wcl://zones/current for IDs.',
      } as ToolError;
    }
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    logger.toolResult('get_encounter_rankings', { success: false, latencyMs, error: String(error) });
    if (error instanceof WCLError) {
      if (error.code === 'auth_failure') return authFailure();
    }
    return serviceUnavailable();
  }
}
