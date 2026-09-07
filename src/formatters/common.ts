export interface ToolError {
  error: string;
  message: string;
  suggestion: string;
}

export function makeError(error: string, message: string, suggestion: string): ToolError {
  return { error, message, suggestion };
}

export function characterNotFound(name: string, realm: string, region: string): ToolError {
  return makeError(
    'character_not_found',
    `No WCL data found for ${titleCase(name)}-${titleCase(realm)} (${region.toUpperCase()})`,
    'The character might not have any uploaded logs. Verify the character name and realm spelling. Common issues: misspelled realm names, wrong region (EU vs US), or the character simply hasn\'t been logged. Check warcraftlogs.com directly.',
  );
}

export function noActiveCharacter(): ToolError {
  return makeError(
    'no_active_character',
    'No active character set and no character identity provided.',
    'Provide a character name, realm, and region. Then call set_active_character to avoid repeating this.',
  );
}

export function authFailure(): ToolError {
  return makeError(
    'auth_failure',
    'Failed to authenticate with WCL. Check client credentials.',
    'Verify the WCL_CLIENT_ID and WCL_CLIENT_SECRET environment variables are correct.',
  );
}

export function serviceUnavailable(detail?: string): ToolError {
  const message = detail
    ? `WCL API error: ${detail}`
    : 'WCL API is currently unreachable.';
  return makeError(
    'service_unavailable',
    message,
    'WCL may be experiencing downtime, or there may be an authentication issue. Check that WCL_CLIENT_ID and WCL_CLIENT_SECRET are correct. Try again in a few minutes.',
  );
}

export function rateLimited(retryAfter?: number): ToolError {
  const wait = retryAfter ? `${retryAfter} seconds` : 'under a minute';
  return makeError(
    'rate_limited',
    `WCL API rate limit reached. Try again in ${wait}.`,
    'This is temporary and will resolve in under a minute. Continue after a brief pause.',
  );
}

export function titleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function computeDps(totalDamage: number, activeTimeMs: number): number {
  if (activeTimeMs <= 0) return 0;
  return Math.round(totalDamage / activeTimeMs * 1000);
}

export function computeHps(totalHealing: number, activeTimeMs: number): number {
  if (activeTimeMs <= 0) return 0;
  return Math.round(totalHealing / activeTimeMs * 1000);
}

export function computeOverhealingPct(overheal: number, totalRaw: number): number {
  if (totalRaw <= 0) return 0;
  return Math.round(overheal / totalRaw * 1000) / 10;
}

export function characterNameRequired(): ToolError {
  return makeError(
    'character_name_required',
    'A character name is needed to pick this player out of the report.',
    'Pass `name`, or call set_active_character first. Realm and region are only needed when the report has to be discovered.',
  );
}
