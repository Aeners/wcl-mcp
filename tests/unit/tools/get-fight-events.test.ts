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
            masterData: {
              actors: [
                { id: 24, name: 'Explanas', type: 'Player' },
                { id: 144, name: "Ula'tek", type: 'NPC' },
                { id: 73, name: 'Force of Nature', type: 'Pet', petOwner: 24 },
              ],
              abilities: [
                { gameID: 190984, name: 'Wrath' },
                { gameID: 102560, name: 'Incarnation: Chosen of Elune' },
              ],
            },
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
      reportData: { report: { fights: [], masterData: { actors: [], abilities: [] } } },
    }));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 99,
    }) as { error: string };

    expect(result.error).toBe('fight_not_found');
  });
});

describe('handleGetFightEvents -- ability names', () => {
  it('names each ability from the report master data', async () => {
    const { client } = stubClient(respond([
      { timestamp: 3587269, type: 'cast', sourceID: 24, abilityGameID: 190984 },
      { timestamp: 3599710, type: 'cast', sourceID: 24, abilityGameID: 102560 },
    ]));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      event_type: 'casts',
    }) as FightEventsResult;

    expect(result.events.map(e => e.abilityName)).toEqual([
      'Wrath',
      'Incarnation: Chosen of Elune',
    ]);
  });

  it('requests the ability table alongside the actor table', async () => {
    const stub = stubClient(respond([]));

    await handleGetFightEvents(stub.client, { report_code: '8DPcRJd1LapWyr6A', fight_id: 13 });

    expect(stub.callWith('FightMeta')?.query).toContain('abilities');
  });
});

describe('handleGetFightEvents -- server-side actor filtering', () => {
  it('passes sourceID to the API instead of filtering after the fact', async () => {
    const stub = stubClient(respond([]));

    await handleGetFightEvents(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      event_type: 'casts',
      source_name: 'Explanas',
    });

    expect(stub.callWith('FightEvents')?.variables.sourceID).toBe(24);
  });

  it('passes targetID for a target filter', async () => {
    const stub = stubClient(respond([]));

    await handleGetFightEvents(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      target_name: "Ula'tek",
    });

    expect(stub.callWith('FightEvents')?.variables.targetID).toBe(144);
  });

  it('keeps every event the API returned -- no post-filtering drops', async () => {
    const { client } = stubClient(respond([
      { timestamp: 3587269, type: 'cast', sourceID: 24, abilityGameID: 190984 },
      { timestamp: 3588533, type: 'cast', sourceID: 24, abilityGameID: 190984 },
    ]));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      source_name: 'Explanas',
    }) as FightEventsResult;

    expect(result.eventCount).toBe(2);
  });

  it('errors with candidate names when the actor is unknown', async () => {
    const stub = stubClient(respond([]));

    const result = await handleGetFightEvents(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      source_name: 'Explanass',
    }) as { error: string; suggestion: string };

    expect(result.error).toBe('actor_not_found');
    expect(result.suggestion).toContain('Explanas');
    expect(stub.callWith('FightEvents')).toBeUndefined();
  });

  it('omits sourceID entirely when no name filter is given', async () => {
    const stub = stubClient(respond([]));

    await handleGetFightEvents(stub.client, { report_code: '8DPcRJd1LapWyr6A', fight_id: 13 });

    expect(stub.callWith('FightEvents')?.variables.sourceID).toBeUndefined();
  });
});

describe('handleGetFightEvents -- pet attribution', () => {
  it('attributes a pet event to its owner', async () => {
    const { client } = stubClient(respond([
      { timestamp: 3587269, type: 'damage', sourceID: 73, abilityGameID: 190984 },
    ]));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      source_name: 'Explanas',
    }) as FightEventsResult;

    expect(result.events[0].sourceName).toBe('Force of Nature');
    expect(result.events[0].sourceOwnerName).toBe('Explanas');
  });

  it('leaves sourceOwnerName off events from a non-pet source', async () => {
    const { client } = stubClient(respond([
      { timestamp: 3587269, type: 'damage', sourceID: 24, abilityGameID: 190984 },
    ]));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
    }) as FightEventsResult;

    expect(result.events[0]).not.toHaveProperty('sourceOwnerName');
  });
});

describe('handleGetFightEvents -- pagination', () => {
  /** Responder serving `pages` in sequence, each with a cursor to the next. */
  function paged(pages: Array<{ events: Array<Record<string, unknown>>; next: number | null }>) {
    let i = 0;
    return (query: string) => {
      if (query.includes('FightMeta')) return respond([])(query);
      const page = pages[Math.min(i, pages.length - 1)];
      i++;
      return { reportData: { report: { events: { data: page.events, nextPageTimestamp: page.next } } } };
    };
  }

  const ev = (t: number) => ({ timestamp: t, type: 'cast', sourceID: 24, abilityGameID: 190984 });

  it('fetches one page by default and hands back a cursor', async () => {
    const { client, calls } = stubClient(paged([
      { events: [ev(3587269)], next: 3599745 },
      { events: [ev(3600000)], next: null },
    ]));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
    }) as FightEventsResult & { hasMore: boolean; nextPageToken: number | null; pagesFetched: number };

    expect(result.eventCount).toBe(1);
    expect(result.hasMore).toBe(true);
    expect(result.nextPageToken).toBe(3599745);
    expect(result.pagesFetched).toBe(1);
    expect(calls.filter(c => c.query.includes('FightEvents'))).toHaveLength(1);
  });

  it('resumes from a page token', async () => {
    const stub = stubClient(paged([{ events: [ev(3600000)], next: null }]));

    await handleGetFightEvents(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      page_token: 3599745,
    });

    expect(stub.callWith('FightEvents')?.variables.startTime).toBe(3599745);
  });

  it('follows the cursor up to max_pages and concatenates', async () => {
    const { client } = stubClient(paged([
      { events: [ev(3587269)], next: 3599745 },
      { events: [ev(3600000)], next: 3610000 },
      { events: [ev(3611000)], next: null },
    ]));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      max_pages: 5,
    }) as FightEventsResult & { hasMore: boolean; pagesFetched: number };

    expect(result.eventCount).toBe(3);
    expect(result.pagesFetched).toBe(3);
    expect(result.hasMore).toBe(false);
  });

  it('stops at max_pages and reports there is more', async () => {
    const { client } = stubClient(paged([
      { events: [ev(3587269)], next: 3599745 },
      { events: [ev(3600000)], next: 3610000 },
      { events: [ev(3611000)], next: 3620000 },
    ]));

    const result = await handleGetFightEvents(client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      max_pages: 2,
    }) as FightEventsResult & { hasMore: boolean; nextPageToken: number | null; pagesFetched: number };

    expect(result.pagesFetched).toBe(2);
    expect(result.eventCount).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextPageToken).toBe(3610000);
  });

  it('rejects a page token that is not an absolute timestamp in this fight', async () => {
    const stub = stubClient(paged([{ events: [], next: null }]));

    const result = await handleGetFightEvents(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_id: 13,
      page_token: 60,
    }) as { error: string };

    expect(result.error).toBe('invalid_page_token');
    expect(stub.callWith('FightEvents')).toBeUndefined();
  });
});
