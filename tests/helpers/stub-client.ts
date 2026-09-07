import type { WCLClient } from '../../src/wcl/client.js';

export interface RecordedCall {
  query: string;
  variables: Record<string, unknown>;
  cacheKey?: string;
}

export interface StubClient {
  client: WCLClient;
  calls: RecordedCall[];
  /** Variables of the first recorded call whose query text contains `marker`. */
  callWith(marker: string): RecordedCall | undefined;
}

/**
 * Builds a fake WCLClient. `responder` receives the GraphQL query text and
 * variables and returns the payload the real API would produce.
 */
export function stubClient(
  responder: (query: string, variables: Record<string, unknown>) => unknown,
): StubClient {
  const calls: RecordedCall[] = [];

  const client = {
    query: async (query: string, variables: Record<string, unknown>, cacheKey?: string) => {
      calls.push({ query, variables, cacheKey });
      return responder(query, variables);
    },
  } as unknown as WCLClient;

  return {
    client,
    calls,
    callWith: (marker: string) => calls.find(c => c.query.includes(marker)),
  };
}
