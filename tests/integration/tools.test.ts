/**
 * Integration tests for MCP tool handlers against live WCL API.
 * Validates the full pipeline: args -> tool handler -> WCL client -> formatter -> response
 *
 * Run with: npx vitest run tests/integration/
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { WCLClient } from '../../src/wcl/client.js';
import { handleSetActiveCharacter } from '../../src/tools/set-active-character.js';
import { handleGetCharacterSummary } from '../../src/tools/get-character-summary.js';
import { handleGetRecentReports } from '../../src/tools/get-recent-reports.js';
import { handleGetFightSummary } from '../../src/tools/get-fight-summary.js';
import { handleGetFightDamage } from '../../src/tools/get-fight-damage.js';
import { handleGetFightHealing } from '../../src/tools/get-fight-healing.js';
import { handleGetFightDamageTaken } from '../../src/tools/get-fight-damage-taken.js';
import { handleGetCharacterDeaths } from '../../src/tools/get-character-deaths.js';
import { handleGetCharacterCasts } from '../../src/tools/get-character-casts.js';
import { handleGetBuffUptime } from '../../src/tools/get-buff-uptime.js';
import { handleGetCombatantInfo } from '../../src/tools/get-combatant-info.js';
import { handleGetEncounterRankings } from '../../src/tools/get-encounter-rankings.js';
import { handleGetFightEvents } from '../../src/tools/get-fight-events.js';
import { clearActiveCharacter } from '../../src/session/context.js';
import { sessionCache } from '../../src/session/cache.js';

config();

let client: WCLClient;
let reportCode: string;
let fightId: number;
let fightIds: number[];

function isError(result: unknown): result is { error: string; message: string; suggestion: string } {
  return typeof result === 'object' && result !== null && 'error' in result;
}

describe('Tool Integration Tests', () => {
  beforeAll(() => {
    const clientId = process.env.WCL_CLIENT_ID;
    const clientSecret = process.env.WCL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('WCL_CLIENT_ID and WCL_CLIENT_SECRET must be set in .env');
    }
    client = new WCLClient(clientId, clientSecret);
    clearActiveCharacter();
    sessionCache.clear();
  });

  // --- set_active_character ---

  describe('set_active_character', () => {
    it('sets Whitearrows on Khadgar-US as active', async () => {
      const result = await handleSetActiveCharacter(client, {
        name: 'Whitearrows',
        realm: 'Khadgar',
        region: 'us',
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.name).toBe('Whitearrows');
      expect(result.realm).toBe('khadgar');
      expect(result.region).toBe('us');
      expect(result.class).toBe('Hunter');
      expect(result.hasLogs).toBe(true);
      expect(result.reportCount).toBeGreaterThan(0);
      expect(result.mostRecentReport).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns character_not_found for nonexistent character', async () => {
      const result = await handleSetActiveCharacter(client, {
        name: 'Zzzznotacharacter',
        realm: 'Khadgar',
        region: 'us',
      });

      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.error).toBe('character_not_found');
      expect(result.suggestion).toBeTruthy();
    });

    it('handles region aliases', async () => {
      const result = await handleSetActiveCharacter(client, {
        name: 'Whitearrows',
        realm: 'Khadgar',
        region: 'na', // alias for "us"
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;
      expect(result.region).toBe('us');
    });

    it('normalizes realm names', async () => {
      const result = await handleSetActiveCharacter(client, {
        name: 'Whitearrows',
        realm: 'KHADGAR', // uppercase
        region: 'us',
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;
      expect(result.realm).toBe('khadgar');
    });

    it('returns error for invalid region', async () => {
      const result = await handleSetActiveCharacter(client, {
        name: 'Whitearrows',
        realm: 'Khadgar',
        region: 'oceanic',
      });

      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.error).toBe('invalid_region');
    });
  });

  // --- get_character_summary ---

  describe('get_character_summary', () => {
    it('returns summary using active character defaults', async () => {
      // Active character was set in previous test
      const result = await handleGetCharacterSummary(client, {});

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.name).toBe('Whitearrows');
      expect(result.class).toBe('Hunter');
      expect(result.hasLogs).toBe(true);
      expect(result.reportCount).toBeGreaterThan(0);
      expect(result.contentTypes).toBeDefined();
      expect(typeof result.contentTypes.mythicPlus).toBe('number');
      expect(typeof result.contentTypes.raid).toBe('number');
    });

    it('returns no_active_character when no identity provided and no active char', async () => {
      clearActiveCharacter();
      const result = await handleGetCharacterSummary(client, {});

      expect(isError(result)).toBe(true);
      if (!isError(result)) return;
      expect(result.error).toBe('no_active_character');

      // Re-set active character for remaining tests
      await handleSetActiveCharacter(client, {
        name: 'Whitearrows',
        realm: 'Khadgar',
        region: 'us',
      });
    });
  });

  // --- get_recent_reports ---

  describe('get_recent_reports', () => {
    it('returns reports with fight metadata', async () => {
      const result = await handleGetRecentReports(client, { limit: 3 });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.character).toBe('Whitearrows');
      expect(result.reportCount).toBeGreaterThan(0);
      expect(result.reports.length).toBeGreaterThan(0);

      const report = result.reports[0];
      expect(report.code).toBeTruthy();
      expect(report.title).toBeTruthy();
      expect(report.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(report.fights.length).toBeGreaterThan(0);

      // Save for later tests
      reportCode = report.code;
      fightId = report.fights[0].id;
      fightIds = report.fights.slice(0, 3).map(f => f.id);

      const fight = report.fights[0];
      expect(fight.id).toBeTypeOf('number');
      expect(fight.name).toBeTruthy();
      expect(fight.duration).toMatch(/^\d+:\d{2}$/); // mm:ss format
      expect(typeof fight.kill).toBe('boolean');
    });

    it('filters by content_type mythicplus', async () => {
      const result = await handleGetRecentReports(client, {
        limit: 5,
        content_type: 'mythicplus',
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      // All fights should have keystoneLevel
      for (const report of result.reports) {
        for (const fight of report.fights) {
          expect(fight.keystoneLevel).toBeDefined();
          expect(fight.keystoneLevel).toBeGreaterThan(0);
        }
      }
    });
  });

  // --- get_fight_summary ---

  describe('get_fight_summary', () => {
    it('returns composite fight overview', async () => {
      const result = await handleGetFightSummary(client, {
        report_code: reportCode,
        fight_ids: fightIds,
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.reportCode).toBe(reportCode);
      expect(result.fights.length).toBeGreaterThan(0);

      const fight = result.fights[0];
      expect(fight.fightId).toBe(fightIds[0]);
      expect(fight.name).toBeTruthy();
      expect(fight.duration).toMatch(/^\d+:\d{2}$/);
      expect(fight.durationMs).toBeGreaterThan(0);
      expect(fight.totalDamage).toBeGreaterThan(0);
      expect(fight.totalHealing).toBeGreaterThan(0);
      expect(fight.groupDps).toBeGreaterThan(0);
      expect(fight.groupHps).toBeGreaterThan(0);
      expect(typeof fight.totalDeaths).toBe('number');
      expect(fight.composition.length).toBeGreaterThan(0);
      expect(fight.topDps.length).toBeGreaterThan(0);
      expect(fight.topDps[0].dps).toBeGreaterThan(0);
    });
  });

  // --- get_fight_damage ---

  describe('get_fight_damage', () => {
    it('returns DPS breakdown', async () => {
      const result = await handleGetFightDamage(client, {
        report_code: reportCode,
        fight_ids: fightIds,
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.totalTime).toBeGreaterThan(0);
      expect(result.totalTimeFmt).toMatch(/^\d+:\d{2}$/);

      const entry = result.entries[0];
      expect(entry.name).toBeTruthy();
      expect(entry.classSpec).toBeTruthy();
      expect(entry.dps).toBeGreaterThan(0);
      expect(entry.totalDamage).toBeGreaterThan(0);
      expect(entry.rank).toBe(1); // Sorted by DPS, first = rank 1
    });

    it('filters by player name', async () => {
      const result = await handleGetFightDamage(client, {
        report_code: reportCode,
        fight_ids: fightIds,
        player_name: 'Whitearrows',
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].name).toBe('Whitearrows');
    });
  });

  // --- get_fight_healing ---

  describe('get_fight_healing', () => {
    it('returns HPS breakdown with overhealing', async () => {
      const result = await handleGetFightHealing(client, {
        report_code: reportCode,
        fight_ids: fightIds,
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.entries.length).toBeGreaterThan(0);

      const entry = result.entries[0];
      expect(entry.name).toBeTruthy();
      expect(entry.hps).toBeGreaterThanOrEqual(0);
      expect(entry.totalHealing).toBeGreaterThanOrEqual(0);
      expect(typeof entry.overhealingPct).toBe('number');
      expect(entry.overhealingPct).toBeGreaterThanOrEqual(0);
      expect(entry.overhealingPct).toBeLessThanOrEqual(100);
    });
  });

  // --- get_fight_damage_taken ---

  describe('get_fight_damage_taken', () => {
    it('returns damage taken breakdown with sources', async () => {
      const result = await handleGetFightDamageTaken(client, {
        report_code: reportCode,
        fight_ids: fightIds,
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.entries.length).toBeGreaterThan(0);

      const entry = result.entries[0];
      expect(entry.name).toBeTruthy();
      expect(entry.totalDamageTaken).toBeGreaterThan(0);
      expect(entry.sources.length).toBeGreaterThan(0);
      expect(entry.sources[0].abilityName).toBeTruthy();
      expect(entry.sources[0].totalDamage).toBeGreaterThan(0);
      // Sources should be sorted descending
      if (entry.sources.length > 1) {
        expect(entry.sources[0].totalDamage).toBeGreaterThanOrEqual(entry.sources[1].totalDamage);
      }
    });
  });

  // --- get_character_deaths (compound) ---

  describe('get_character_deaths', () => {
    it('aggregates deaths across recent reports', async () => {
      const result = await handleGetCharacterDeaths(client, {
        limit_reports: 2,
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.character).toBe('Whitearrows');
      expect(result.reportsAnalyzed).toBeGreaterThan(0);
      expect(result.fightsAnalyzed).toBeGreaterThan(0);
      expect(typeof result.totalDeaths).toBe('number');
      expect(typeof result.averageDeathsPerFight).toBe('number');
      expect(Array.isArray(result.deathsByAbility)).toBe(true);
      expect(Array.isArray(result.deathsByPlayer)).toBe(true);
    });

    it('scopes to a specific report', async () => {
      const result = await handleGetCharacterDeaths(client, {
        report_code: reportCode,
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.reportsAnalyzed).toBe(1);
    });
  });

  // --- get_character_casts (compound) ---

  describe('get_character_casts', () => {
    it('returns valid result structure (may have 0 fights if character not in logged groups)', async () => {
      // Note: WCL Casts table only includes players IN the fight's group.
      // If Whitearrows uploaded logs for other groups' runs, they won't
      // appear in those casts tables. This test validates the structure.
      // Scope tightly to avoid timeout from per-fight API calls.
      const result = await handleGetCharacterCasts(client, {
        report_code: reportCode,
        fight_ids: [fightId],
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.playerName).toBe('Whitearrows');
      expect(typeof result.fightsAnalyzed).toBe('number');
      expect(typeof result.reportsAnalyzed).toBe('number');
      expect(result.reportsAnalyzed).toBeGreaterThan(0);
      expect(Array.isArray(result.abilities)).toBe(true);

      // If we found fights with Whitearrows, validate ability shape
      if (result.fightsAnalyzed > 0) {
        expect(result.abilities.length).toBeGreaterThan(0);
        expect(result.abilities[0].abilityName).toBeTruthy();
        expect(result.abilities[0].totalCasts).toBeGreaterThan(0);
      }
    });
  });

  // --- get_buff_uptime ---

  describe('get_buff_uptime', () => {
    it('returns buff auras with uptime percentages', async () => {
      const result = await handleGetBuffUptime(client, {
        report_code: reportCode,
        fight_ids: fightIds,
        buff_type: 'buffs',
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.buffType).toBe('buffs');
      expect(result.auras.length).toBeGreaterThan(0);

      const aura = result.auras[0];
      expect(aura.name).toBeTruthy();
      expect(typeof aura.uptimePct).toBe('number');
      expect(aura.uptimePct).toBeGreaterThan(0);
      expect(aura.totalUptime).toBeGreaterThan(0);
    });
  });

  // --- get_combatant_info ---

  describe('get_combatant_info', () => {
    it('returns combatant details for a fight', async () => {
      const result = await handleGetCombatantInfo(client, {
        report_code: reportCode,
        fight_id: fightId,
      });

      expect(isError(result)).toBe(false);
      if (isError(result)) return;

      expect(result.combatants.length).toBeGreaterThan(0);

      const whitearrows = result.combatants.find(c => c.name === 'Whitearrows');
      expect(whitearrows).toBeDefined();
      expect(whitearrows!.classSpec).toBeTruthy();
    });
  });

  describe('time windows', () => {
    it('scopes a damage table to the first 60 seconds', async () => {
      const full = await handleGetFightDamage(client, {
        report_code: reportCode,
        fight_ids: [fightId],
      }) as { totalTime: number; entries: Array<{ name: string; totalDamage: number }> };

      const firstMinute = await handleGetFightDamage(client, {
        report_code: reportCode,
        fight_ids: [fightId],
        start_time_s: 0,
        end_time_s: 60,
      }) as { totalTime: number; entries: Array<{ name: string; totalDamage: number }> };

      expect(firstMinute.entries.length).toBeGreaterThan(0);
      expect(firstMinute.totalTime).toBeLessThanOrEqual(full.totalTime);

      // A sub-window cannot contain more damage than the whole fight.
      const sum = (es: Array<{ totalDamage: number }>) => es.reduce((a, e) => a + e.totalDamage, 0);
      expect(sum(firstMinute.entries)).toBeLessThan(sum(full.entries));
    }, 20_000);

    it('scopes events to the window, relative to the pull', async () => {
      const result = await handleGetFightEvents(client, {
        report_code: reportCode,
        fight_id: fightId,
        event_type: 'casts',
        start_time_s: 0,
        end_time_s: 30,
      }) as { events: Array<{ relativeTime: number }>; window?: unknown };

      expect(result.window).toBeTruthy();
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.events.every(e => e.relativeTime >= 0 && e.relativeTime <= 30)).toBe(true);
    }, 20_000);

    it('refuses a window across several fights', async () => {
      const result = await handleGetFightDamage(client, {
        report_code: reportCode,
        fight_ids: fightIds.length > 1 ? fightIds : [fightId, fightId + 1],
        start_time_s: 0,
        end_time_s: 60,
      });

      expect(isError(result)).toBe(true);
      if (isError(result)) expect(result.error).toBe('window_needs_single_fight');
    });
  });

  // --- get_fight_events ---

  describe('get_fight_events', () => {
    it('returns raw combat events without source filter', async () => {
      const result = await handleGetFightEvents(client, {
        report_code: reportCode,
        fight_id: fightId,
        event_type: 'damage-done',
      }) as {
        eventCount: number;
        events: Array<Record<string, unknown>>;
        hasMore: boolean;
        fightName: string;
      };

      expect(result.eventCount).toBeGreaterThan(0);
      expect(result.events.length).toBeGreaterThan(0);
      expect(result.fightName).toBeTruthy();
      expect(typeof result.hasMore).toBe('boolean');

      // Events should have enriched sourceName/targetName
      const firstEvent = result.events[0];
      expect(firstEvent.sourceName).toBeTruthy();
    });

    it('filters to a single source server-side', async () => {
      const unfiltered = await handleGetFightEvents(client, {
        report_code: reportCode,
        fight_id: fightId,
        event_type: 'damage-done',
      }) as { events: Array<Record<string, unknown>> };

      const someone = unfiltered.events.find(e => e.sourceName)?.sourceName as string;
      expect(someone).toBeTruthy();

      const filtered = await handleGetFightEvents(client, {
        report_code: reportCode,
        fight_id: fightId,
        event_type: 'damage-done',
        source_name: someone,
      }) as { eventCount: number; events: Array<Record<string, unknown>> };

      // Every returned event belongs to that actor or to one of its pets --
      // proof the API honoured sourceID rather than us discarding a page of
      // raid-wide events. WCL's sourceID filter is owner-scoped.
      expect(filtered.eventCount).toBeGreaterThan(0);
      expect(filtered.events.every(
        e => e.sourceName === someone || e.sourceOwnerName === someone,
      )).toBe(true);
    }, 20_000);

    it('enriches events with pull-relative times and ability names', async () => {
      const result = await handleGetFightEvents(client, {
        report_code: reportCode,
        fight_id: fightId,
        event_type: 'casts',
      }) as {
        pullTimestamp: number;
        fightDurationMs: number;
        events: Array<Record<string, unknown>>;
      };

      expect(typeof result.pullTimestamp).toBe('number');
      expect(result.fightDurationMs).toBeGreaterThan(0);

      const first = result.events[0];
      expect(typeof first.relativeTime).toBe('number');
      expect(first.relativeTime).toBe(
        Math.round((first.timestamp as number) - result.pullTimestamp) / 1000,
      );
      expect(result.events.some(e => typeof e.abilityName === 'string')).toBe(true);
    });

    it('follows the cursor across pages', async () => {
      const onePage = await handleGetFightEvents(client, {
        report_code: reportCode,
        fight_id: fightId,
        event_type: 'damage-done',
      }) as { eventCount: number; hasMore: boolean; nextPageToken: number | null; pagesFetched: number };

      expect(onePage.pagesFetched).toBe(1);
      if (!onePage.hasMore) return; // short fight, nothing to page through

      expect(typeof onePage.nextPageToken).toBe('number');

      const resumed = await handleGetFightEvents(client, {
        report_code: reportCode,
        fight_id: fightId,
        event_type: 'damage-done',
        page_token: onePage.nextPageToken!,
      }) as { eventCount: number };
      expect(resumed.eventCount).toBeGreaterThan(0);

      const twoPages = await handleGetFightEvents(client, {
        report_code: reportCode,
        fight_id: fightId,
        event_type: 'damage-done',
        max_pages: 2,
      }) as { eventCount: number; pagesFetched: number };

      expect(twoPages.pagesFetched).toBe(2);
      expect(twoPages.eventCount).toBeGreaterThan(onePage.eventCount);
    }, 30_000);

    it('rejects an unknown source name instead of returning nothing', async () => {
      const result = await handleGetFightEvents(client, {
        report_code: reportCode,
        fight_id: fightId,
        source_name: 'Nosuchplayerxyz',
      });

      expect(isError(result)).toBe(true);
      if (isError(result)) expect(result.error).toBe('actor_not_found');
    });
  });
});
