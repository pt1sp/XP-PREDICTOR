export type SessionRecord = {
  id: number;
  userId: number | null;
  playedAt: Date;
  rule: string;
  stage1: string;
  stage2: string;
  weapon: string;
  wins: number;
  losses: number;
  fatigue: number;
  irritability: number;
  concentration: number;
  startXp: number;
  endXp: number;
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
  rule: string;
  stage1: string;
  stage2: string;
  weapon: string;
  fatigue: number;
  irritability: number;
  concentration: number;
  startXp: number;
};

type WeightedSession = {
  session: SessionRecord;
  weight: number;
};

export type PersonalizedPrediction = {
  predictedWinRate: number;
  baseWinRate: number;
  weaponWinRate: number;
  stageWinRate: number;
  mentalPenalty: number;
  predictedXpDelta: number;
  expectedEndXp: number;
  winRateInterval: { low: number; high: number };
  xpDeltaInterval: { low: number; high: number };
  recommendPlay: boolean;
  advice: string;
  note: string;
};

function stageMatches(session: SessionRecord, condition: PredictionCondition) {
  return (
    session.stage1 === condition.stage1 ||
    session.stage2 === condition.stage1 ||
    session.stage1 === condition.stage2 ||
    session.stage2 === condition.stage2
  );
}

function buildWeightedSessions(
  sessions: SessionRecord[],
  targetUserId: number | null,
  targetWeight = 0.6,
  otherWeight = 0.4
): WeightedSession[] {
  return sessions.map((session) => ({
    session,
    weight:
      targetUserId !== null && session.userId === targetUserId ? targetWeight : otherWeight,
  }));
}

function weightedWinLoss(items: WeightedSession[]) {
  let wins = 0;
  let losses = 0;
  for (const item of items) {
    wins += item.session.wins * item.weight;
    losses += item.session.losses * item.weight;
  }
  return { wins, losses };
}

function weightedMeanStd(values: Array<{ value: number; weight: number }>) {
  if (values.length === 0) {
    return { mean: 0, std: 0, nEff: 0 };
  }
  const sumW = values.reduce((a, v) => a + v.weight, 0);
  if (sumW <= 0) {
    return { mean: 0, std: 0, nEff: 0 };
  }
  const mean = values.reduce((a, v) => a + v.value * v.weight, 0) / sumW;
  const variance = values.reduce((a, v) => a + v.weight * (v.value - mean) ** 2, 0) / sumW;
  const sumW2 = values.reduce((a, v) => a + v.weight * v.weight, 0);
  const nEff = sumW2 > 0 ? (sumW * sumW) / sumW2 : 0;
  return { mean, std: Math.sqrt(Math.max(variance, 0)), nEff };
}

function buildAdvice(recommendPlay: boolean, winRate: number, xpDelta: number, condition: PredictionCondition) {
  if (recommendPlay) {
    return `予測勝率 ${Math.round(winRate * 1000) / 10}%・期待XP ${Math.round(xpDelta)}。${condition.rule}でこの編成は狙い目です。`;
  }
  return `予測勝率 ${Math.round(winRate * 1000) / 10}%・期待XP ${Math.round(xpDelta)}。無理せず見送る判断が安全です。`;
}

export function predictPersonalizedByCondition(
  trainSessions: SessionRecord[],
  condition: PredictionCondition,
  targetUserId: number | null
): PersonalizedPrediction {
  if (trainSessions.length === 0) {
    const predictedWinRate = 0.5;
    const predictedXpDelta = 0;
    return {
      predictedWinRate,
      baseWinRate: 0.5,
      weaponWinRate: 0.5,
      stageWinRate: 0.5,
      mentalPenalty: 0,
      predictedXpDelta,
      expectedEndXp: condition.startXp + predictedXpDelta,
      winRateInterval: { low: 0.35, high: 0.65 },
      xpDeltaInterval: { low: -120, high: 120 },
      recommendPlay: false,
      advice: "データ不足のため安全側に表示しています。",
      note: "個人6:全体4の重み + ルール/武器/ステージ + メンタル補正で算出",
    };
  }

  const weightedAll = buildWeightedSessions(trainSessions, targetUserId);
  const globalByRule = weightedAll.filter((x) => x.session.rule === condition.rule);
  const basePool = globalByRule.length > 0 ? globalByRule : weightedAll;

  const baseWL = weightedWinLoss(basePool);
  const base =
    baseWL.wins + baseWL.losses > 0 ? baseWL.wins / (baseWL.wins + baseWL.losses) : 0.5;

  const weaponPool = basePool.filter((x) => x.session.weapon === condition.weapon);
  const weaponWL = weightedWinLoss(weaponPool);
  const weaponRate = smoothedRate(weaponWL.wins, weaponWL.losses, base, 12);

  const stagePool = basePool.filter((x) => stageMatches(x.session, condition));
  const stageWL = weightedWinLoss(stagePool);
  const stageRate = smoothedRate(stageWL.wins, stageWL.losses, base, 12);

  const fatigueNorm = clamp((condition.fatigue - 1) / 4);
  const irriNorm = clamp((condition.irritability - 1) / 4);
  const concentrationNorm = clamp((5 - condition.concentration) / 4);
  const xpNorm = clamp(condition.startXp / 5000);
  const mentalPenalty =
    0.03 * fatigueNorm + 0.03 * irriNorm + 0.03 * concentrationNorm + 0.02 * xpNorm;

  const predictedWinRate = clamp(
    base + 0.5 * (weaponRate - base) + 0.3 * (stageRate - base) - mentalPenalty
  );

  const xpRows = basePool.map((x) => ({
    value: x.session.endXp - x.session.startXp,
    weight: x.weight,
  }));
  const xpRuleRows = globalByRule.map((x) => ({
    value: x.session.endXp - x.session.startXp,
    weight: x.weight,
  }));
  const xpWeaponRows = weaponPool.map((x) => ({
    value: x.session.endXp - x.session.startXp,
    weight: x.weight,
  }));
  const xpStageRows = stagePool.map((x) => ({
    value: x.session.endXp - x.session.startXp,
    weight: x.weight,
  }));

  const xpGlobal = weightedMeanStd(xpRows);
  const xpRule = weightedMeanStd(xpRuleRows);
  const xpWeapon = weightedMeanStd(xpWeaponRows);
  const xpStage = weightedMeanStd(xpStageRows);

  const predictedXpDelta =
    0.4 * xpRule.mean +
    0.3 * xpWeapon.mean +
    0.2 * xpStage.mean +
    0.1 * xpGlobal.mean +
    (predictedWinRate - 0.5) * 140;

  const nEff = Math.max(6, xpRule.nEff + 0.5 * xpWeapon.nEff + 0.5 * xpStage.nEff);
  const winStd = Math.sqrt(Math.max(predictedWinRate * (1 - predictedWinRate), 0.0001) / nEff);
  const winRateInterval = {
    low: clamp(predictedWinRate - 1.96 * winStd),
    high: clamp(predictedWinRate + 1.96 * winStd),
  };

  const xpStd = Math.max(
    20,
    0.5 * xpRule.std + 0.25 * xpWeapon.std + 0.15 * xpStage.std + 0.1 * xpGlobal.std
  );
  const xpDeltaInterval = {
    low: predictedXpDelta - 1.96 * xpStd,
    high: predictedXpDelta + 1.96 * xpStd,
  };

  const recommendPlay = predictedXpDelta > 0;
  return {
    predictedWinRate,
    baseWinRate: base,
    weaponWinRate: weaponRate,
    stageWinRate: stageRate,
    mentalPenalty,
    predictedXpDelta,
    expectedEndXp: condition.startXp + predictedXpDelta,
    winRateInterval,
    xpDeltaInterval,
    recommendPlay,
    advice: buildAdvice(recommendPlay, predictedWinRate, predictedXpDelta, condition),
    note: "個人6:全体4の重み + ルール/武器/ステージ + メンタル補正で算出",
  };
}

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

  const weaponSessions = sessions.filter(
    (s) => s.rule === condition.rule && s.weapon === condition.weapon
  );
  const weaponWins = weaponSessions.reduce((a, s) => a + s.wins, 0);
  const weaponLoss = weaponSessions.reduce((a, s) => a + s.losses, 0);
  const weaponRate = smoothedRate(weaponWins, weaponLoss, base, 12);

  const stageSessions = sessions.filter(
    (s) =>
      s.rule === condition.rule &&
      (s.stage1 === condition.stage1 ||
        s.stage2 === condition.stage1 ||
        s.stage1 === condition.stage2 ||
        s.stage2 === condition.stage2)
  );
  const stageWins = stageSessions.reduce((a, s) => a + s.wins, 0);
  const stageLoss = stageSessions.reduce((a, s) => a + s.losses, 0);
  const stageRate = smoothedRate(stageWins, stageLoss, base, 12);

  const fatigueNorm = clamp((condition.fatigue - 1) / 4);
  const irriNorm = clamp((condition.irritability - 1) / 4);
  const concentrationNorm = clamp((5 - condition.concentration) / 4);
  const xpNorm = clamp(condition.startXp / 5000);
  const mentalPenalty =
    0.05 * fatigueNorm + 0.06 * irriNorm + 0.05 * concentrationNorm + 0.04 * xpNorm;

  const pred = clamp(
    base + 0.45 * (weaponRate - base) + 0.35 * (stageRate - base) - mentalPenalty
  );

  return {
    predictedWinRate: pred,
    baseWinRate: base,
    weaponWinRate: weaponRate,
    stageWinRate: stageRate,
    mentalPenalty,
    note: "全体成績 + 武器/ステージ補正 - メンタル/XP補正で算出",
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

  const weaponSessions = sessions.filter(
    (s) => s.rule === latest.rule && s.weapon === latest.weapon
  );
  const weaponWins = weaponSessions.reduce((a, s) => a + s.wins, 0);
  const weaponLoss = weaponSessions.reduce((a, s) => a + s.losses, 0);
  const weaponRate = smoothedRate(weaponWins, weaponLoss, base, 12);

  const stageSessions = sessions.filter(
    (s) =>
      s.rule === latest.rule &&
      (s.stage1 === latest.stage1 ||
        s.stage2 === latest.stage1 ||
        s.stage1 === latest.stage2 ||
        s.stage2 === latest.stage2)
  );
  const stageWins = stageSessions.reduce((a, s) => a + s.wins, 0);
  const stageLoss = stageSessions.reduce((a, s) => a + s.losses, 0);
  const stageRate = smoothedRate(stageWins, stageLoss, base, 12);

  const fatigueNorm = clamp((latest.fatigue - 1) / 4);
  const irriNorm = clamp((latest.irritability - 1) / 4);
  const concentrationNorm = clamp((5 - latest.concentration) / 4);
  const xpNorm = clamp(latest.startXp / 5000);
  const mentalPenalty =
    0.05 * fatigueNorm + 0.06 * irriNorm + 0.05 * concentrationNorm + 0.04 * xpNorm;

  const pred = clamp(
    base + 0.45 * (weaponRate - base) + 0.35 * (stageRate - base) - mentalPenalty
  );

  return {
    predictedWinRate: pred,
    baseWinRate: base,
    weaponWinRate: weaponRate,
    stageWinRate: stageRate,
    mentalPenalty,
    note: "全体成績 + 武器/ステージ補正 - メンタル/XP補正で算出",
  };
}
