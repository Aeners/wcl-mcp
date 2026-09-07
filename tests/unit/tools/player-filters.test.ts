import { describe, it, expect, beforeEach } from 'vitest';
import { handleGetBuffUptime } from '../../../src/tools/get-buff-uptime.js';
import { handleGetCombatantInfo } from '../../../src/tools/get-combatant-info.js';
import { filterSummaryToPlayer } from '../../../src/formatters/combatants.js';
import { stubClient } from '../../helpers/stub-client.js';
import { sessionCache } from '../../../src/session/cache.js';

const ACTORS = [
  { id: 24, name: 'Explanas', type: 'Player', subType: 'Druid', icon: 'Druid-Balance' },
  { id: 30, name: 'Nevernine', type: 'Player', subType: 'Warlock', icon: 'Warlock-Destruction' },
];

function buffResponder() {
  return (query: string) => {
    if (query.includes('FightActors')) {
      return { reportData: { report: { masterData: { actors: ACTORS } } } };
    }
    return {
      reportData: {
        report: {
          table: {
            data: {
              totalTime: 581373,
              auras: [{ name: 'Eclipse (Solar)', guid: 48517, totalUptime: 100000, totalUses: 6 }],
            },
          },
        },
      },
    };
  };
}

describe('get_buff_uptime -- player filter', () => {
  beforeEach(() => sessionCache.clear());

  it('passes sourceID to the API so the result is actually per-player', async () => {
    const stub = stubClient(buffResponder());

    await handleGetBuffUptime(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_ids: [13],
      buff_type: 'buffs',
      player_name: 'Explanas',
    });

    expect(stub.callWith('FightTable')?.variables.sourceID).toBe(24);
  });

  it('leaves sourceID unset for a raid-wide query and skips the actor lookup', async () => {
    const stub = stubClient(buffResponder());

    await handleGetBuffUptime(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_ids: [13],
      buff_type: 'buffs',
    });

    expect(stub.callWith('FightActors')).toBeUndefined();
    expect(stub.callWith('FightTable')?.variables.sourceID).toBeUndefined();
  });

  it('keys the cache per player so two players never share a result', async () => {
    const stub = stubClient(buffResponder());

    await handleGetBuffUptime(stub.client, {
      report_code: '8DPcRJd1LapWyr6A', fight_ids: [13], buff_type: 'buffs', player_name: 'Explanas',
    });
    await handleGetBuffUptime(stub.client, {
      report_code: '8DPcRJd1LapWyr6A', fight_ids: [13], buff_type: 'buffs', player_name: 'Nevernine',
    });

    const keys = stub.calls.filter(c => c.query.includes('FightTable')).map(c => c.cacheKey);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('errors on an unknown player instead of returning raid-wide data', async () => {
    const stub = stubClient(buffResponder());

    const result = await handleGetBuffUptime(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_ids: [13],
      buff_type: 'buffs',
      player_name: 'Nosuchplayer',
    }) as { error: string; suggestion: string };

    expect(result.error).toBe('actor_not_found');
    expect(result.suggestion).toContain('Explanas');
    expect(stub.callWith('FightTable')).toBeUndefined();
  });
});

const SUMMARY = {
  totalTime: 581373,
  logVersion: 30,
  composition: [{ name: 'Explanas', type: 'Druid' }, { name: 'Nevernine', type: 'Warlock' }],
  damageDone: [{ name: 'Explanas', total: 149442292 }, { name: 'Nevernine', total: 11876897 }],
  deathEvents: [{ name: 'Nevernine', deathTime: 120000 }],
  playerDetails: {
    dps: [
      { name: 'Explanas', potionUse: 1, healthstoneUse: 0 },
      { name: 'Nevernine', potionUse: 0, healthstoneUse: 1 },
    ],
    tanks: [{ name: 'Tankguy' }],
    healers: [],
  },
};

describe('filterSummaryToPlayer', () => {
  it('keeps only the requested player in each role array', () => {
    const out = filterSummaryToPlayer(SUMMARY, 'Explanas') as typeof SUMMARY;
    expect(out.playerDetails.dps).toEqual([{ name: 'Explanas', potionUse: 1, healthstoneUse: 0 }]);
    expect(out.playerDetails.tanks).toEqual([]);
  });

  it('filters every player-keyed top-level array', () => {
    const out = filterSummaryToPlayer(SUMMARY, 'Explanas') as typeof SUMMARY;
    expect(out.composition).toHaveLength(1);
    expect(out.damageDone).toHaveLength(1);
    expect(out.deathEvents).toEqual([]);
  });

  it('passes scalar fields through untouched', () => {
    const out = filterSummaryToPlayer(SUMMARY, 'Explanas') as typeof SUMMARY;
    expect(out.totalTime).toBe(581373);
    expect(out.logVersion).toBe(30);
  });

  it('is case-insensitive', () => {
    const out = filterSummaryToPlayer(SUMMARY, 'explanas') as typeof SUMMARY;
    expect(out.damageDone).toHaveLength(1);
  });

  it('does not mutate the input', () => {
    filterSummaryToPlayer(SUMMARY, 'Explanas');
    expect(SUMMARY.playerDetails.dps).toHaveLength(2);
  });

  it('tolerates a null summary', () => {
    expect(filterSummaryToPlayer(null, 'Explanas')).toBeNull();
  });
});

describe('get_combatant_info -- player filter', () => {
  beforeEach(() => sessionCache.clear());

  function combatantResponder() {
    return () => ({
      reportData: {
        report: {
          masterData: { actors: ACTORS },
          fights: [{ id: 13, name: "Ula'tek", startTime: 0, endTime: 1 }],
          playerDetails: { data: SUMMARY },
        },
      },
    });
  }

  it('narrows playerDetails, not just the combatant list', async () => {
    const { client } = stubClient(combatantResponder());

    const result = await handleGetCombatantInfo(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      player_name: 'Explanas',
    }) as { combatants: Array<{ name: string }>; playerDetails: typeof SUMMARY };

    expect(result.combatants).toEqual([{ name: 'Explanas', classSpec: 'Druid-Balance' }]);
    expect(result.playerDetails.playerDetails.dps).toHaveLength(1);
    expect(result.playerDetails.damageDone).toHaveLength(1);
  });

  it('returns the whole roster when no player is named', async () => {
    const { client } = stubClient(combatantResponder());

    const result = await handleGetCombatantInfo(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
    }) as { combatants: unknown[]; playerDetails: typeof SUMMARY };

    expect(result.combatants).toHaveLength(2);
    expect(result.playerDetails.playerDetails.dps).toHaveLength(2);
  });

  it('errors on an unknown player instead of returning the full roster', async () => {
    const { client } = stubClient(combatantResponder());

    const result = await handleGetCombatantInfo(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      player_name: 'Nosuchplayer',
    }) as { error: string };

    expect(result.error).toBe('actor_not_found');
  });
});
