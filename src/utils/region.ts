const REGION_ALIASES: Record<string, string> = {
  na: 'us',
  america: 'us',
  americas: 'us',
  europe: 'eu',
  korea: 'kr',
  taiwan: 'tw',
};

const VALID_REGIONS = new Set(['us', 'eu', 'kr', 'tw']);

export function normalizeRegion(region: string): string {
  const lower = region.toLowerCase().trim();
  const mapped = REGION_ALIASES[lower] ?? lower;
  if (!VALID_REGIONS.has(mapped)) {
    throw new Error(`Invalid region "${region}". Valid regions: us, eu, kr, tw`);
  }
  return mapped;
}
