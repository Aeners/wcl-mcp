export interface AuraEntry {
  name: string;
  guid: number;
  totalUptime: number;
  totalUses: number;
  uptimePct: number;
}

export interface BuffUptimeResult {
  totalTime: number;
  auras: AuraEntry[];
}

export interface WCLAura {
  name: string;
  guid: number;
  type: number;
  totalUptime: number;
  totalUses: number;
  abilityIcon?: string;
}

export function formatBuffAuras(
  auras: WCLAura[],
  totalTime: number,
): BuffUptimeResult {
  const formatted = auras.map(a => ({
    name: a.name,
    guid: a.guid,
    totalUptime: a.totalUptime,
    totalUses: a.totalUses,
    uptimePct: totalTime > 0 ? Math.round(a.totalUptime / totalTime * 1000) / 10 : 0,
  })).sort((a, b) => b.uptimePct - a.uptimePct);

  return { totalTime, auras: formatted };
}
