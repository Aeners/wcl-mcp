import { describe, it, expect, beforeEach } from 'vitest';
import { handleGetCharacterCasts } from '../../../src/tools/get-character-casts.js';
import { handleGetCharacterDeaths } from '../../../src/tools/get-character-deaths.js';
import { stubClient } from '../../helpers/stub-client.js';
import { clearActiveCharacter } from '../../../src/session/context.js';
import { sessionCache } from '../../../src/session/cache.js';

const handlers = [
  ['get_character_casts', handleGetCharacterCasts, 'Casts'],
  ['get_character_deaths', handleGetCharacterDeaths, 'Deaths'],
] as const;

function tableResponder() {
  return () => ({
    reportData: {
      report: {
        table: { data: { entries: [], totalTime: 60000, deathEvents: [] } },
      },
    },
  });
}

describe.each(handlers)('%s -- character identity', (_name, handler) => {
  beforeEach(() => {
    clearActiveCharacter();
    sessionCache.clear();
  });

  it('works from report_code + fight_ids + name, with no realm or region', async () => {
    const stub = stubClient(tableResponder());

    const result = await handler(stub.client, {
      name: 'Explanas',
      report_code: '8DPcRJd1LapWyr6A',
      fight_ids: [13],
    } as never);

    expect(result).not.toHaveProperty('error');
    // It must not try to discover reports for an unknown realm.
    expect(stub.callWith('RecentReports')).toBeUndefined();
    expect(stub.callWith('FightTable')).toBeDefined();
  });

  it('still requires a name when the report is scoped', async () => {
    const stub = stubClient(tableResponder());

    const result = await handler(stub.client, {
      report_code: '8DPcRJd1LapWyr6A',
      fight_ids: [13],
    } as never) as { error: string };

    expect(result.error).toBe('character_name_required');
    expect(stub.calls).toHaveLength(0);
  });

  it('still requires realm and region when the report must be discovered', async () => {
    const stub = stubClient(tableResponder());

    const result = await handler(stub.client, { name: 'Explanas' } as never) as { error: string };

    expect(result.error).toBe('no_active_character');
    expect(stub.calls).toHaveLength(0);
  });

  it('requires realm and region when fight_ids are missing', async () => {
    const stub = stubClient(tableResponder());

    const result = await handler(stub.client, {
      name: 'Explanas',
      report_code: '8DPcRJd1LapWyr6A',
    } as never) as { error: string };

    expect(result.error).toBe('no_active_character');
  });

  it('rejects an invalid region when one is supplied', async () => {
    const stub = stubClient(tableResponder());

    const result = await handler(stub.client, {
      name: 'Explanas',
      realm: 'Khadgar',
      region: 'moon',
      report_code: '8DPcRJd1LapWyr6A',
      fight_ids: [13],
    } as never) as { error: string };

    expect(result.error).toBe('invalid_region');
  });
});
