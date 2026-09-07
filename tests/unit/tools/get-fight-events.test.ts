import { describe, it, expect } from 'vitest';
import { handleGetFightEvents } from '../../../src/tools/get-fight-events.js';
import { stubClient } from '../../helpers/stub-client.js';

const PULL = 3587007;
const END = 4168380;

interface FightEventsResult {
  pullTimestamp: number;
  fightEndTimestamp: number;
  fightDurationMs: number;
  eventCount: number;
  events: Array<Record<string, unknown>>;
}

function respond(events: Array<Record<string, unknown>>, nextPageTimestamp: number | null = null) {
  return (query: string) => {
    if (query.includes('FightMeta')) {
      return {
        reportData: {
          report: {
            fights: [{ id: 13, name: "Ula'tek", startTime: PULL, endTime: END }],
            masterData: { actors: [{ id: 24, name: 'Explanas', type: 'Player' }] },
          },
        },
      };
    }
    return { reportData: { report: { events: { data: events, nextPageTimestamp } } } };
  };
}

describe('handleGetFightEvents -- pull timestamp', () => {
  it('exposes the pull timestamp and fight duration', async () => {
    const { client } = stubClient(respond([]));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
    }) as FightEventsResult;

    expect(result.pullTimestamp).toBe(PULL);
    expect(result.fightEndTimestamp).toBe(END);
    expect(result.fightDurationMs).toBe(END - PULL);
  });

  it('stamps every event with seconds since the pull', async () => {
    const { client } = stubClient(respond([
      { timestamp: 3587269, type: 'cast', sourceID: 24, abilityGameID: 190984 },
      { timestamp: 3599710, type: 'cast', sourceID: 24, abilityGameID: 102560 },
    ]));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      event_type: 'casts',
    }) as FightEventsResult;

    expect(result.events.map(e => e.relativeTime)).toEqual([0.262, 12.703]);
  });

  it('preserves the original absolute timestamp alongside relativeTime', async () => {
    const { client } = stubClient(respond([
      { timestamp: 3587269, type: 'cast', sourceID: 24, abilityGameID: 190984 },
    ]));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
    }) as FightEventsResult;

    expect(result.events[0].timestamp).toBe(3587269);
    expect(result.events[0].sourceName).toBe('Explanas');
  });

  it('returns a structured error when the fight is missing', async () => {
    const { client } = stubClient(() => ({
      reportData: { report: { fights: [], masterData: { actors: [] } } },
    }));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 99,
    }) as { error: string };

    expect(result.error).toBe('fight_not_found');
  });
});
