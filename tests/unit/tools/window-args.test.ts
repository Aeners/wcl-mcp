import { describe, it, expect } from 'vitest';
import { handleGetFightDamage } from '../../../src/tools/get-fight-damage.js';
import { handleGetFightEvents } from '../../../src/tools/get-fight-events.js';
import { stubClient } from '../../helpers/stub-client.js';
import { sessionCache } from '../../../src/session/cache.js';

const PULL = 3587007;
const END = 4168380;

function tableResponder() {
  return (query: string) => {
    if (query.includes('FightTimes')) {
      return { reportData: { report: { fights: [{ id: 13, startTime: PULL, endTime: END }] } } };
    }
    return {
      reportData: {
        report: {
          table: {
            data: {
              totalTime: 60000,
              entries: [{ name: 'Explanas', type: 'Druid', icon: 'Druid-Balance', total: 12146354, activeTime: 60000 }],
            },
          },
        },
      },
    };
  };
}

function eventsResponder() {
  return (query: string) => {
    if (query.includes('FightMeta')) {
      return {
        reportData: {
          report: {
            fights: [{ id: 13, name: "Ula'tek", startTime: PULL, endTime: END }],
            masterData: { actors: [{ id: 24, name: 'Explanas', type: 'Player' }], abilities: [] },
          },
        },
      };
    }
    return { reportData: { report: { events: { data: [], nextPageTimestamp: null } } } };
  };
}

describe('time windows on table tools', () => {
  it('sends absolute window bounds to the API', async () => {
    sessionCache.clear();
    const stub = stubClient(tableResponder());

    await handleGetFightDamage(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_ids: [13],
      start_time_s: 0,
      end_time_s: 60,
    });

    const table = stub.callWith('FightTable');
    expect(table?.variables.startTime).toBe(PULL);
    expect(table?.variables.endTime).toBe(PULL + 60_000);
  });

  it('skips the extra timings round trip when no window is asked for', async () => {
    sessionCache.clear();
    const stub = stubClient(tableResponder());

    await handleGetFightDamage(stub.client, { report_code: '8DPcRJd1LapWyr6A', fight_ids: [13] });

    expect(stub.callWith('FightTimes')).toBeUndefined();
    expect(stub.callWith('FightTable')?.variables.startTime).toBeUndefined();
  });

  it('does not serve a windowed result from the full-fight cache entry', async () => {
    sessionCache.clear();
    const stub = stubClient(tableResponder());

    await handleGetFightDamage(stub.client, { report_code: '8DPcRJd1LapWyr6A', fight_ids: [13] });
    await handleGetFightDamage(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_ids: [13],
      start_time_s: 0,
      end_time_s: 60,
    });

    const keys = stub.calls.filter(c => c.query.includes('FightTable')).map(c => c.cacheKey);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('refuses a window spanning several fights', async () => {
    sessionCache.clear();
    const stub = stubClient(tableResponder());

    const result = await handleGetFightDamage(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_ids: [13, 14],
      start_time_s: 0,
      end_time_s: 60,
    }) as { error: string };

    expect(result.error).toBe('window_needs_single_fight');
    expect(stub.callWith('FightTable')).toBeUndefined();
  });
});

describe('time windows on get_fight_events', () => {
  it('narrows the event query to the window', async () => {
    const stub = stubClient(eventsResponder());

    await handleGetFightEvents(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      event_type: 'casts',
      start_time_s: 0,
      end_time_s: 60,
    });

    expect(stub.callWith('FightEvents')?.variables.startTime).toBe(PULL);
    expect(stub.callWith('FightEvents')?.variables.endTime).toBe(PULL + 60_000);
  });

  it('echoes the requested window back', async () => {
    const { client } = stubClient(eventsResponder());

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      start_time_s: 10,
      end_time_s: 70,
    }) as { window?: { startTimeS: number; endTimeS: number } };

    expect(result.window).toEqual({ startTimeS: 10, endTimeS: 70 });
  });

  it('reports no window for a full-fight query', async () => {
    const { client } = stubClient(eventsResponder());

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
    }) as { window?: unknown };

    expect(result.window).toBeUndefined();
  });

  it('rejects an inverted window', async () => {
    const stub = stubClient(eventsResponder());

    const result = await handleGetFightEvents(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      start_time_s: 60,
      end_time_s: 10,
    }) as { error: string };

    expect(result.error).toBe('invalid_window');
    expect(stub.callWith('FightEvents')).toBeUndefined();
  });
});
