/**
 * Integration tests against the live WCL API.
 * Requires WCL_CLIENT_ID and WCL_CLIENT_SECRET in .env
 *
 * Run with: npx vitest run tests/integration/
 *
 * Target character: Whitearrows-Khadgar (US), Hunter, classID 3
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { config } from 'dotenv';
import { WCLClient } from '../../src/wcl/client.js';
import { RECENT_REPORTS_QUERY, FIGHT_TABLE_QUERY, FIGHT_SUMMARY_QUERY, ENCOUNTER_RANKINGS_QUERY, COMBATANT_INFO_QUERY, FIGHT_EVENTS_QUERY } from '../../src/wcl/queries.js';
import type { WCLCharacter, WCLTableEntry, WCLDeathEntry, WCLActor } from '../../src/wcl/queries.js';

config();

const TEST_CHARACTER = {
  name: 'Whitearrows',
  serverSlug: 'khadgar',
  serverRegion: 'us',
};

let client: WCLClient;
let testReportCode: string;
let testFightId: number;
let testFightIds: number[];

describe('WCL API Integration', () => {
  beforeAll(() => {
    const clientId = process.env.WCL_CLIENT_ID;
    const clientSecret = process.env.WCL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('WCL_CLIENT_ID and WCL_CLIENT_SECRET must be set in .env');
    }
    client = new WCLClient(clientId, clientSecret);
  });

  // --- Auth ---

  describe('Authentication', () => {
    it('obtains a valid token and executes a query', async () => {
      const data = await client.query<{ characterData: { character: { name: string } | null } }>(
        `{ characterData { character(name: "${TEST_CHARACTER.name}", serverSlug: "${TEST_CHARACTER.serverSlug}", serverRegion: "${TEST_CHARACTER.serverRegion}") { name } } }`,
        {},
      );
      expect(data.characterData).toBeDefined();
    });
  });

  // --- Character Discovery ---

  describe('Character Discovery (recentReports)', () => {
    it('finds Whitearrows on Khadgar-US', async () => {
      const data = await client.query<{ characterData: { character: WCLCharacter | null } }>(
        RECENT_REPORTS_QUERY,
        { ...TEST_CHARACTER, limit: 3 },
      );

      const character = data.characterData.character;
      expect(character).not.toBeNull();
      expect(character!.name).toBe('Whitearrows');
      expect(character!.classID).toBe(3); // Hunter
      expect(character!.recentReports.data.length).toBeGreaterThan(0);

      // Save report/fight info for subsequent tests
      const report = character!.recentReports.data[0];
      testReportCode = report.code;
      expect(testReportCode).toBeTruthy();
      expect(report.title).toBeTruthy();
      expect(report.startTime).toBeGreaterThan(0);
      expect(report.endTime).toBeGreaterThan(report.startTime);

      // Fights
      expect(report.fights.length).toBeGreaterThan(0);
      testFightId = report.fights[0].id;
      testFightIds = report.fights.slice(0, 3).map(f => f.id);

      // Fight shape
      const fight = report.fights[0];
      expect(fight.id).toBeTypeOf('number');
      expect(fight.name).toBeTruthy();
      expect(fight.startTime).toBeTypeOf('number');
      expect(fight.endTime).toBeTypeOf('number');
      // kill is boolean or null
      expect(typeof fight.kill === 'boolean' || fight.kill === null).toBe(true);
    });

    it('returns null for a nonexistent character', async () => {
      const data = await client.query<{ characterData: { character: WCLCharacter | null } }>(
        RECENT_REPORTS_QUERY,
        { name: 'Zzzznotreal', serverSlug: 'khadgar', serverRegion: 'us', limit: 1 },
      );
      expect(data.characterData.character).toBeNull();
    });
  });

  // --- Fight Tables ---

  describe('Fight Table: DamageDone', () => {
    it('returns damage entries with expected shape', async () => {
      const data = await client.query<{
        reportData: { report: { table: { data: { entries: WCLTableEntry[]; totalTime: number } } } }
      }>(
        FIGHT_TABLE_QUERY,
        { code: testReportCode, fightIDs: testFightIds, dataType: 'DamageDone' },
      );

      const tableData = data.reportData.report.table.data;
      expect(tableData.totalTime).toBeGreaterThan(0);
      expect(tableData.entries.length).toBeGreaterThan(0);

      const entry = tableData.entries[0];
      expect(entry.name).toBeTruthy();
      expect(entry.total).toBeTypeOf('number');
      expect(entry.icon).toBeTruthy(); // class-spec encoding, e.g. "Hunter-Marksmanship"
      expect(entry.type).toBeTruthy();
    });
  });

  describe('Fight Table: Healing', () => {
    it('returns healing entries with expected shape', async () => {
      const data = await client.query<{
        reportData: { report: { table: { data: { entries: WCLTableEntry[]; totalTime: number } } } }
      }>(
        FIGHT_TABLE_QUERY,
        { code: testReportCode, fightIDs: testFightIds, dataType: 'Healing' },
      );

      const tableData = data.reportData.report.table.data;
      expect(tableData.totalTime).toBeGreaterThan(0);
      expect(tableData.entries.length).toBeGreaterThan(0);

      const entry = tableData.entries[0];
      expect(entry.name).toBeTruthy();
      expect(entry.total).toBeTypeOf('number');
    });
  });

  describe('Fight Table: DamageTaken', () => {
    it('returns damage taken entries', async () => {
      const data = await client.query<{
        reportData: { report: { table: { data: { entries: WCLTableEntry[]; totalTime: number } } } }
      }>(
        FIGHT_TABLE_QUERY,
        { code: testReportCode, fightIDs: testFightIds, dataType: 'DamageTaken' },
      );

      const tableData = data.reportData.report.table.data;
      expect(tableData.entries.length).toBeGreaterThan(0);

      const entry = tableData.entries[0];
      expect(entry.name).toBeTruthy();
      expect(entry.total).toBeTypeOf('number');
    });
  });

  describe('Fight Table: Deaths', () => {
    it('returns deaths entries (may be empty if no deaths)', async () => {
      const data = await client.query<{
        reportData: { report: { table: { data: { entries: WCLDeathEntry[]; totalTime: number } } } }
      }>(
        FIGHT_TABLE_QUERY,
        { code: testReportCode, fightIDs: testFightIds, dataType: 'Deaths' },
      );

      const tableData = data.reportData.report.table.data;
      expect(tableData).toBeDefined();
      expect(Array.isArray(tableData.entries)).toBe(true);
      // Deaths may be empty -- that's valid
    });
  });

  describe('Fight Table: Casts', () => {
    it('returns cast entries with abilities', async () => {
      const data = await client.query<{
        reportData: { report: { table: { data: { entries: WCLTableEntry[]; totalTime: number } } } }
      }>(
        FIGHT_TABLE_QUERY,
        { code: testReportCode, fightIDs: [testFightId], dataType: 'Casts' },
      );

      const tableData = data.reportData.report.table.data;
      expect(tableData.entries.length).toBeGreaterThan(0);
    });
  });

  describe('Fight Table: Buffs', () => {
    it('returns auras (not entries) with expected shape', async () => {
      const data = await client.query<{
        reportData: { report: { table: { data: { auras: Array<{ name: string; guid: number; totalUptime: number; totalUses: number }>; totalTime: number } } } }
      }>(
        FIGHT_TABLE_QUERY,
        { code: testReportCode, fightIDs: testFightIds, dataType: 'Buffs' },
      );

      const tableData = data.reportData.report.table.data;
      expect(tableData.auras.length).toBeGreaterThan(0);
      expect(tableData.auras[0].name).toBeTruthy();
      expect(tableData.auras[0].totalUptime).toBeTypeOf('number');
      expect(tableData.auras[0].totalUses).toBeTypeOf('number');
    });
  });

  // --- Batched Query (Fight Summary) ---

  describe('Fight Summary (batched aliases)', () => {
    it('returns fights, actors, damage, healing, and deaths in one query', async () => {
      const data = await client.query<{
        reportData: {
          report: {
            fights: Array<{ id: number; name: string; startTime: number; endTime: number }>;
            masterData: { actors: WCLActor[] };
            damageTable: { data: { entries: WCLTableEntry[]; totalTime: number } };
            healingTable: { data: { entries: WCLTableEntry[]; totalTime: number } };
            deathsTable: { data: { entries: WCLDeathEntry[]; totalTime: number } };
          };
        };
      }>(
        FIGHT_SUMMARY_QUERY,
        { code: testReportCode, fightIDs: testFightIds },
      );

      const report = data.reportData.report;

      // Fights
      expect(report.fights.length).toBeGreaterThan(0);
      expect(report.fights[0].id).toBe(testFightIds[0]);

      // Actors
      expect(report.masterData.actors.length).toBeGreaterThan(0);
      const playerActors = report.masterData.actors.filter(a => a.type === 'Player');
      expect(playerActors.length).toBeGreaterThan(0);
      expect(playerActors[0].name).toBeTruthy();
      expect(playerActors[0].icon).toBeTruthy();

      // Damage table
      expect(report.damageTable.data.entries.length).toBeGreaterThan(0);
      expect(report.damageTable.data.totalTime).toBeGreaterThan(0);

      // Healing table
      expect(report.healingTable.data.entries.length).toBeGreaterThan(0);

      // Deaths table (may be empty)
      expect(Array.isArray(report.deathsTable.data.entries)).toBe(true);
    });
  });

  // --- Combatant Info ---

  describe('Combatant Info', () => {
    it('returns master data actors for a fight', async () => {
      const data = await client.query<{
        reportData: {
          report: {
            masterData: { actors: WCLActor[] };
            fights: Array<{ id: number; name: string }>;
            playerDetails: unknown;
          };
        };
      }>(
        COMBATANT_INFO_QUERY,
        { code: testReportCode, fightIDs: [testFightId] },
      );

      const report = data.reportData.report;
      expect(report.masterData.actors.length).toBeGreaterThan(0);
      expect(report.fights.length).toBeGreaterThan(0);

      // Check Whitearrows is in the actors
      const whitearrows = report.masterData.actors.find(
        a => a.name === 'Whitearrows'
      );
      expect(whitearrows).toBeDefined();
      expect(whitearrows!.type).toBe('Player');
    });
  });

  // --- Fight Events ---

  describe('Fight Events', () => {
    it('returns combat events for a fight', async () => {
      // First get fight timing
      const fightData = await client.query<{
        reportData: {
          report: {
            fights: Array<{ id: number; startTime: number; endTime: number }>;
            masterData: { actors: WCLActor[] };
          };
        };
      }>(
        FIGHT_SUMMARY_QUERY,
        { code: testReportCode, fightIDs: [testFightId] },
      );

      const fight = fightData.reportData.report.fights[0];
      expect(fight).toBeDefined();

      const eventsData = await client.query<{
        reportData: {
          report: {
            events: {
              data: unknown[];
              nextPageTimestamp: number | null;
            };
          };
        };
      }>(
        FIGHT_EVENTS_QUERY,
        {
          code: testReportCode,
          fightID: testFightId,
          startTime: fight.startTime,
          endTime: fight.endTime,
          dataType: 'DamageDone',
        },
      );

      const events = eventsData.reportData.report.events;
      expect(events.data.length).toBeGreaterThan(0);
      // nextPageTimestamp can be null (all events fit) or a number
      expect(typeof events.nextPageTimestamp === 'number' || events.nextPageTimestamp === null).toBe(true);
    });
  });

  // --- Session Cache ---

  describe('Session Cache', () => {
    it('second identical query hits cache (faster)', async () => {
      const cacheKey = 'integration-test-cache-key';

      const start1 = Date.now();
      await client.query(
        RECENT_REPORTS_QUERY,
        { ...TEST_CHARACTER, limit: 1 },
        cacheKey,
      );
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await client.query(
        RECENT_REPORTS_QUERY,
        { ...TEST_CHARACTER, limit: 1 },
        cacheKey,
      );
      const time2 = Date.now() - start2;

      // Cached query should be essentially instant (<5ms vs potentially hundreds of ms)
      expect(time2).toBeLessThan(5);
      expect(time2).toBeLessThan(time1);
    });
  });
});
