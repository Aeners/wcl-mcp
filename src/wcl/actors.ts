// Resolving actor names to the numeric IDs the WCL events API filters on.
//
// masterData actor IDs and the sourceID/targetID carried by events share the
// same ID space, so a name can be turned into a server-side filter instead of
// fetching a page of raid-wide events and discarding most of it.

export interface ActorRef {
  id: number;
  name: string;
  type?: string;
}

export interface ActorResolution {
  /** The ID to filter on, or undefined when the name matched nothing. */
  id?: number;
  /** Every actor sharing that name -- more than one means the filter is ambiguous. */
  matches: ActorRef[];
}

export function resolveActorId(actors: ActorRef[], name: string): ActorResolution {
  const wanted = name.trim().toLowerCase();
  const matches = actors.filter(a => a.name?.toLowerCase() === wanted);
  return { id: matches[0]?.id, matches };
}

/**
 * Names to offer back when a filter matched nothing. Prefers substring hits so
 * a partial or misspelled name still points somewhere useful.
 */
export function suggestActorNames(actors: ActorRef[], name: string, limit = 8): string[] {
  const wanted = name.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (candidate: string) => {
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    out.push(candidate);
  };

  for (const a of actors) {
    if (a.name?.toLowerCase().includes(wanted)) push(a.name);
  }
  for (const a of actors) {
    if (out.length >= limit) break;
    push(a.name);
  }

  return out.slice(0, limit);
}

export const FIGHT_ACTORS_QUERY = `
query FightActors($code: String!) {
  reportData {
    report(code: $code) {
      masterData {
        actors {
          id
          name
          type
        }
      }
    }
  }
}
`;
