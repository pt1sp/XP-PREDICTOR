export type SessionRecord = {
  id: number;
  userId: number | null;
  playedAt: Date;
  stage1: string;
  stage2: string;
  weapon: string;
  wins: number;
  losses: number;
  fatigue: number;
  irritability: number;
  memo: string | null;
  createdAt: Date;
};

const clamp = (x: number, min = 0, max = 1) => Math.max(min, Math.min(max, x));

function smoothedRate(wins: number, losses: number, priorRate: number, k = 10) {
  const priorWins = priorRate * k;
  const priorLoss = (1 - priorRate) * k;
  const w = wins + priorWins;
  const l = losses + priorLoss;
  return w / (w + l);
}

export type PredictionCondition = {
  stage1: string;
  stage2: string;
  weapon: string;
  fatigue: number;
  irritability: number;
};

export function predictWinRateByCondition(
  sessions: SessionRecord[],
  condition: PredictionCondition
) {
  if (sessions.length === 0) {
    return {
      predictedWinRate: 0.5,
      baseWinRate: 0.5,
      weaponWinRate: 0.5,
      stageWinRate: 0.5,
      mentalPenalty: 0,
      note: "データが少ないため 50% を基準に表示しています",
    };
  }

  const totalWins = sessions.reduce((a, s) => a + s.wins, 0);
  const totalLoss = sessions.reduce((a, s) => a + s.losses, 0);
  const base = totalWins / (totalWins + totalLoss);

  const weaponSessions = sessions.filter((s) => s.weapon === condition.weapon);
  const weaponWins = weaponSessions.reduce((a, s) => a + s.wins, 0);
  const weaponLoss = weaponSessions.reduce((a, s) => a + s.losses, 0);
  const weaponRate = smoothedRate(weaponWins, weaponLoss, base, 12);

  const stageSessions = sessions.filter(
    (s) =>
      s.stage1 === condition.stage1 ||
      s.stage2 === condition.stage1 ||
      s.stage1 === condition.stage2 ||
      s.stage2 === condition.stage2
  );
  const stageWins = stageSessions.reduce((a, s) => a + s.wins, 0);
  const stageLoss = stageSessions.reduce((a, s) => a + s.losses, 0);
  const stageRate = smoothedRate(stageWins, stageLoss, base, 12);

  const fatigueNorm = clamp((condition.fatigue - 1) / 4);
  const irriNorm = clamp((condition.irritability - 1) / 4);
  const mentalPenalty = 0.06 * fatigueNorm + 0.08 * irriNorm;

  const pred = clamp(
    base + 0.45 * (weaponRate - base) + 0.35 * (stageRate - base) - mentalPenalty
  );

  return {
    predictedWinRate: pred,
    baseWinRate: base,
    weaponWinRate: weaponRate,
    stageWinRate: stageRate,
    mentalPenalty,
    note: "全体成績 + 武器/ステージ補正 - メンタル補正で算出",
  };
}

export function predictNextWinRate(sessions: SessionRecord[]) {
  if (sessions.length === 0) {
    return {
      predictedWinRate: 0.5,
      baseWinRate: 0.5,
      weaponWinRate: 0.5,
      stageWinRate: 0.5,
      mentalPenalty: 0,
      note: "データが少ないため 50% を基準に表示しています",
    };
  }

  const totalWins = sessions.reduce((a, s) => a + s.wins, 0);
  const totalLoss = sessions.reduce((a, s) => a + s.losses, 0);
  const base = totalWins / (totalWins + totalLoss);

  const latest = [...sessions].sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())[0];

  const weaponSessions = sessions.filter((s) => s.weapon === latest.weapon);
  const weaponWins = weaponSessions.reduce((a, s) => a + s.wins, 0);
  const weaponLoss = weaponSessions.reduce((a, s) => a + s.losses, 0);
  const weaponRate = smoothedRate(weaponWins, weaponLoss, base, 12);

  const stageSessions = sessions.filter(
    (s) =>
      s.stage1 === latest.stage1 ||
      s.stage2 === latest.stage1 ||
      s.stage1 === latest.stage2 ||
      s.stage2 === latest.stage2
  );
  const stageWins = stageSessions.reduce((a, s) => a + s.wins, 0);
  const stageLoss = stageSessions.reduce((a, s) => a + s.losses, 0);
  const stageRate = smoothedRate(stageWins, stageLoss, base, 12);

  const fatigueNorm = clamp((latest.fatigue - 1) / 4);
  const irriNorm = clamp((latest.irritability - 1) / 4);
  const mentalPenalty = 0.06 * fatigueNorm + 0.08 * irriNorm;

  const pred = clamp(
    base + 0.45 * (weaponRate - base) + 0.35 * (stageRate - base) - mentalPenalty
  );

  return {
    predictedWinRate: pred,
    baseWinRate: base,
    weaponWinRate: weaponRate,
    stageWinRate: stageRate,
    mentalPenalty,
    note: "全体成績 + 武器/ステージ補正 - メンタル補正で算出",
  };
}

