export interface RankingEntry {
  encounterName: string;
  encounterID: number;
  difficulty: number;
  metric: string;
  rankPercent: number;
  medianPercent: number;
  totalKills: number;
  bestAmount: number;
  spec: string;
  reportCode?: string;
  fightID?: number;
}

export function formatEncounterRankings(rawRankings: unknown): RankingEntry[] {
  // encounterRankings returns a JSON blob; structure varies by query
  const rankings = rawRankings as {
    encounterID?: number;
    encounter?: { name: string; id: number };
    difficulty?: number;
    metric?: { type: string };
    rankPercent?: number;
    medianPerformance?: number;
    totalKills?: number;
    bestAmount?: number;
    spec?: string;
    ranks?: Array<{
      rankPercent: number;
      amount: number;
      report?: { code: string };
      startTime?: number;
    }>;
  };

  if (!rankings) return [];

  // If it's a single encounter result
  if (rankings.ranks) {
    return rankings.ranks.map(r => ({
      encounterName: rankings.encounter?.name ?? 'Unknown',
      encounterID: rankings.encounter?.id ?? rankings.encounterID ?? 0,
      difficulty: rankings.difficulty ?? 0,
      metric: rankings.metric?.type ?? 'dps',
      rankPercent: r.rankPercent,
      medianPercent: rankings.medianPerformance ?? 0,
      totalKills: rankings.totalKills ?? 0,
      bestAmount: r.amount,
      spec: rankings.spec ?? '',
      reportCode: r.report?.code,
    }));
  }

  return [];
}

export function formatZoneRankings(rawRankings: unknown): Array<{
  encounterName: string;
  encounterID: number;
  rankPercent: number;
  medianPercent: number;
  bestAmount: number;
  totalKills: number;
}> {
  const rankings = rawRankings as {
    rankings?: Array<{
      encounter?: { name: string; id: number };
      rankPercent?: number;
      medianPercent?: number;
      bestAmount?: number;
      totalKills?: number;
    }>;
  };

  if (!rankings?.rankings) return [];

  return rankings.rankings.map(r => ({
    encounterName: r.encounter?.name ?? 'Unknown',
    encounterID: r.encounter?.id ?? 0,
    rankPercent: r.rankPercent ?? 0,
    medianPercent: r.medianPercent ?? 0,
    bestAmount: r.bestAmount ?? 0,
    totalKills: r.totalKills ?? 0,
  }));
}
