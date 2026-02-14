import { useState, useMemo, useEffect, type CSSProperties } from "react";
import { fetchPredictionByCondition } from "./api";
import type { Prediction, PredictionConditionInput, Rule } from "./api";
import { STAGES, WEAPON_CATEGORIES, getWeaponCategory, getStageImagePath, getWeaponImagePath } from "./Constants";

type PickerKind = "stage1" | "stage2" | "weapon";
type MentalKey = "fatigue" | "irritability" | "concentration";
type SparkleStyle = CSSProperties & { "--delay": string; "--angle": string };

type AnalysisPhase = "idle" | "analyzing" | "calculating" | "complete";

const MENTAL_SCALE = [1, 2, 3, 4, 5] as const;
const ANALYSIS_DELAY_MS = 1600;
const CALCULATION_DELAY_MS = 2000;
const COMPLETE_DELAY_MS = 500;
const STAT_STEP_DELAY_MS = 800;
const XP_MIN = 2000;
const XP_MAX = 5000;
const XP_STEP = 10;
const XP_QUICK_DELTAS = [-100, -50, +50, +100] as const;
const RULE_OPTIONS: Rule[] = ["エリア", "ヤグラ", "ホコ", "アサリ"];

function pct(x: number) {
  return `${Math.round(x * 1000) / 10}%`;
}

function signed(x: number) {
  return `${x >= 0 ? "+" : ""}${Math.round(x)}`;
}

// カウントアップ用のカスタムフック
function useCountUp(target: number, duration: number, shouldStart: boolean) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!shouldStart) {
      return;
    }

    const startTime = Date.now();
    const startValue = 0;
    let frameId = 0;

    const animate = () => {
      const now = Date.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // イージング関数（ease-out）
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = startValue + (target - startValue) * eased;

      setCurrent(value);

      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [target, duration, shouldStart]);

  return shouldStart ? current : 0;
}

export default function PredictView() {
  const [condition, setCondition] = useState<PredictionConditionInput>({
    rule: "エリア",
    stage1: "",
    stage2: "",
    weapon: "",
    fatigue: 3,
    irritability: 3,
    concentration: 3,
    startXp: 2500,
  });

  const [pred, setPred] = useState<Prediction | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>("idle");

  const [pickerOpen, setPickerOpen] = useState<PickerKind | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [weaponCat, setWeaponCat] = useState<string>(WEAPON_CATEGORIES[0]?.key ?? "shooter");

  // アニメーション用の状態
  const [showStats, setShowStats] = useState(false);
  const [currentStat, setCurrentStat] = useState(0);

  const stageCandidates = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return [...STAGES];
    return STAGES.filter((s) => s.toLowerCase().includes(q));
  }, [pickerQuery]);

  const weaponCandidates = useMemo(() => {
    const cat = WEAPON_CATEGORIES.find((c) => c.key === weaponCat) ?? WEAPON_CATEGORIES[0];
    const list = cat?.weapons ?? [];
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((w) => w.toLowerCase().includes(q));
  }, [weaponCat, pickerQuery]);

  const clampInt = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.trunc(v)));

  const setConditionValue = <K extends keyof PredictionConditionInput>(
    key: K,
    value: PredictionConditionInput[K]
  ) => {
    setCondition((prev) => ({ ...prev, [key]: value }));
  };

  const setScale = (key: MentalKey, value: number) => {
    const next = clampInt(value, 1, 5);
    setConditionValue(key, next);
  };

  const setStartXp = (rawValue: string) => {
    setConditionValue("startXp", clampInt(Number(rawValue || XP_MIN), XP_MIN, XP_MAX));
  };

  const adjustStartXp = (delta: number) => {
    setCondition((prev) => ({
      ...prev,
      startXp: clampInt(prev.startXp + delta, XP_MIN, XP_MAX),
    }));
  };

  // カウントアップアニメーション
  const animatedBase = useCountUp(pred?.baseWinRate ?? 0, 600, showStats && currentStat >= 1);
  const animatedWeapon = useCountUp(pred?.weaponWinRate ?? 0, 600, showStats && currentStat >= 2);
  const animatedStage = useCountUp(pred?.stageWinRate ?? 0, 600, showStats && currentStat >= 3);
  const animatedPenalty = useCountUp(pred?.mentalPenalty ?? 0, 600, showStats && currentStat >= 4);
  const animatedFinal = useCountUp(pred?.predictedWinRate ?? 0, 800, showStats && currentStat >= 5);
  const animatedXpDeltaAbs = useCountUp(
    Math.abs(pred?.predictedXpDelta ?? 0),
    800,
    showStats && currentStat >= 5
  );
  const animatedXpDelta = (pred?.predictedXpDelta ?? 0) >= 0 ? animatedXpDeltaAbs : -animatedXpDeltaAbs;

  async function onPredict(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setPred(null);
    setShowStats(false);
    setCurrentStat(0);

    // バリデーション
    if (!condition.rule || !condition.stage1 || !condition.stage2 || !condition.weapon) {
      setMsg("ルール、ステージ、武器を選択してください");
      return;
    }

    if (condition.stage1 === condition.stage2) {
      setMsg("ステージ1とステージ2は別のステージを選択してください");
      return;
    }

    setLoading(true);
    setAnalysisPhase("analyzing");

    try {
      // フェーズ1: データ分析中 (800ms)
      await new Promise(resolve => setTimeout(resolve, ANALYSIS_DELAY_MS));
      setAnalysisPhase("calculating");

      // フェーズ2: 計算中
      await new Promise(resolve => setTimeout(resolve, CALCULATION_DELAY_MS));

      // 実際のAPI呼び出し
      const result = await fetchPredictionByCondition(condition);
      setPred(result);

      setAnalysisPhase("complete");

      // 完了後、少し待ってから統計表示を開始
      await new Promise(resolve => setTimeout(resolve, COMPLETE_DELAY_MS));
      setShowStats(true);

      // 各統計を順番に表示
      for (let i = 1; i <= 5; i++) {
        await new Promise(resolve => setTimeout(resolve, STAT_STEP_DELAY_MS));
        setCurrentStat(i);
      }

      setMsg("");
    } catch (err) {
      setMsg(`予測に失敗: ${String(err)}`);
      setAnalysisPhase("idle");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="viewContainer">
      {/* 条件入力セクション - 予測中は非表示 */}
      {!loading && !pred && (
        <section className="inputSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">情報を入力</h2>
            <div className="sectionSubtitle">これからプレイする条件を入力して勝率を予測</div>
          </div>

          <form onSubmit={onPredict} className="inputForm">
            {/* ステージ選択 */}
            <div className="formGroup">
              <label className="formLabel">
                <svg className="labelIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M3 7h18M3 12h18M3 17h18" />
                </svg>
                ルール
              </label>
              <select
                className="filterSelect"
                value={condition.rule}
                onChange={(e) => setConditionValue("rule", e.target.value as Rule)}
              >
                {RULE_OPTIONS.map((rule) => (
                  <option key={rule} value={rule}>
                    {rule}
                  </option>
                ))}
              </select>
            </div>

            {/* ステージ選択 */}
            <div className="formGroup">
              <label className="formLabel">
                <svg className="labelIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                バトルステージ
              </label>

              <div className="stageGrid">
                <div className="stageSlot">
                  <div className="slotLabel">ステージ 1</div>
                  <button
                    type="button"
                    className="selectBtn"
                    style={{
                      backgroundImage: condition.stage1 ? `url(${getStageImagePath(condition.stage1)})` : undefined,
                    }}
                    onClick={() => {
                      setPickerQuery("");
                      setPickerOpen("stage1");
                    }}
                  >
                    <span className="selectBtnText">{condition.stage1 || "選択してください"}</span>
                    <svg className="selectIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>

                <div className="stageSlot">
                  <div className="slotLabel">ステージ 2</div>
                  <button
                    type="button"
                    className="selectBtn"
                    style={{
                      backgroundImage: condition.stage2 ? `url(${getStageImagePath(condition.stage2)})` : undefined,
                    }}
                    onClick={() => {
                      setPickerQuery("");
                      setPickerOpen("stage2");
                    }}
                  >
                    <span className="selectBtnText">{condition.stage2 || "選択してください"}</span>
                    <svg className="selectIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* 武器選択 */}
            <div className="formGroup">
              <label className="formLabel">
                <svg className="labelIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
                使用する武器
              </label>

              <button
                type="button"
                className={`weaponSelectBtn ${condition.weapon ? 'selected' : ''}`}
                style={{
                  backgroundImage: condition.weapon ? `url(${getWeaponImagePath(condition.weapon)})` : undefined,
                }}
                onClick={() => {
                  setPickerQuery("");
                  setPickerOpen("weapon");
                }}
              >
                <div className="weaponDisplay">
                  <span className="weaponName">{condition.weapon || "武器を選択"}</span>
                  {condition.weapon && (
                    <span className="weaponCategory">
                      {getWeaponCategory(condition.weapon)?.label}
                    </span>
                  )}
                </div>
                <svg className="selectIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>

            <div className="formGroup">
              <label className="formLabel">
                <svg className="labelIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 1v22M1 12h22" />
                </svg>
                開始XP
              </label>
              <div className="numberInputGrid single">
                <div className="numberInputCard">
                  <div className="numberInputRow">
                    <div className="numberInputLabel">試合開始時のXP</div>
                    <div className="numberInputValue">{condition.startXp}</div>
                  </div>
                  <input
                    className="numberInput"
                    type="number"
                    min={XP_MIN}
                    max={XP_MAX}
                    step={XP_STEP}
                    inputMode="numeric"
                    value={condition.startXp}
                    onChange={(e) => setStartXp(e.target.value)}
                  />
                  <input
                    className="xpRange"
                    type="range"
                    min={XP_MIN}
                    max={XP_MAX}
                    step={XP_STEP}
                    value={condition.startXp}
                    onChange={(e) => setStartXp(e.target.value)}
                  />
                  <div className="xpQuickRow">
                    {XP_QUICK_DELTAS.map((delta) => (
                      <button
                        key={`predict-xp-${delta}`}
                        type="button"
                        className="xpQuickBtn"
                        onClick={() => adjustStartXp(delta)}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* メンタル状態 */}
            <div className="mentalColumn">
              <div className="mentalCard">
                <div className="mentalHeader">
                  <svg className="mentalIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                  <span className="mentalLabel">疲労度</span>
                </div>
                <div className="scaleControl">
                  {MENTAL_SCALE.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`scaleBtn ${condition.fatigue === n ? "active" : ""}`}
                      onClick={() => setScale("fatigue", n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="scaleHint">
                  <span>余裕</span>
                  <span>限界</span>
                </div>
              </div>

              <div className="mentalCard">
                <div className="mentalHeader">
                  <svg className="mentalIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span className="mentalLabel">イライラ度</span>
                </div>
                <div className="scaleControl">
                  {MENTAL_SCALE.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`scaleBtn ${condition.irritability === n ? "active" : ""}`}
                      onClick={() => setScale("irritability", n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="scaleHint">
                  <span>穏やか</span>
                  <span>激怒</span>
                </div>
              </div>

              <div className="mentalCard">
                <div className="mentalHeader">
                  <svg className="mentalIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <span className="mentalLabel">集中力</span>
                </div>
                <div className="scaleControl">
                  {MENTAL_SCALE.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`scaleBtn ${condition.concentration === n ? "active" : ""}`}
                      onClick={() => setScale("concentration", n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="scaleHint">
                  <span>散漫</span>
                  <span>集中</span>
                </div>
              </div>
            </div>

            {/* 予測ボタン */}
            <div className="formActions">
              <button type="submit" className="submitBtn" disabled={loading}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {loading ? "分析中..." : "勝率を予測"}
              </button>
            </div>

            {msg && (
              <div className={`messageBox ${msg.includes('失敗') ? 'error' : 'success'}`}>
                {msg}
              </div>
            )}
          </form>

          {/* ピッカーモーダル */}
          {pickerOpen && (
            <div
              className="pickerOverlay"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setPickerOpen(null);
              }}
            >
              <div className="pickerModal">
                <div className="pickerHeader">
                  <div>
                    <h3 className="pickerTitle">
                      {pickerOpen === "weapon" ? "武器を選択" : "ステージを選択"}
                    </h3>
                    <p className="pickerSubtitle">
                      {pickerOpen === "weapon"
                        ? "カテゴリーから武器を選んでください"
                        : "プレイするステージを選択してください"}
                    </p>
                  </div>
                  <button className="closeBtn" type="button" onClick={() => setPickerOpen(null)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span className="closeBtnLabel">閉じる</span>
                  </button>
                </div>

                {pickerOpen === "weapon" && (
                  <div className="categoryTabs">
                    {WEAPON_CATEGORIES.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        className={`categoryTab ${c.key === weaponCat ? "active" : ""}`}
                        onClick={() => setWeaponCat(c.key)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="pickerGrid">
                  {(pickerOpen === "weapon" ? weaponCandidates : stageCandidates).map((name) => {
                    const current =
                      pickerOpen === "weapon"
                        ? condition.weapon
                        : pickerOpen === "stage1"
                          ? condition.stage1
                          : condition.stage2;

                    const stageDuplicate =
                      (pickerOpen === "stage1" && name === condition.stage2) ||
                      (pickerOpen === "stage2" && name === condition.stage1);

                    const active = name === current;

                    return (
                      <button
                        key={name}
                        type="button"
                        className={`pickerItem ${active ? "active" : ""}`}
                        disabled={stageDuplicate}
                        style={{
                          backgroundImage: pickerOpen === "weapon"
                            ? `url(${getWeaponImagePath(name)})`
                            : `url(${getStageImagePath(name)})`,
                          opacity: stageDuplicate ? 0.45 : undefined,
                          cursor: stageDuplicate ? "not-allowed" : undefined,
                        }}
                        onClick={() => {
                          if (stageDuplicate) return;
                          if (pickerOpen === "weapon") setConditionValue("weapon", name);
                          if (pickerOpen === "stage1") setConditionValue("stage1", name);
                          if (pickerOpen === "stage2") setConditionValue("stage2", name);
                          setPickerOpen(null);
                        }}
                      >
                        {active && (
                          <svg className="checkIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        <span className="pickerItemText">{name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* AI分析演出セクション - 予測中のみ表示 */}
      {loading && (
        <section className="analysisSection">
          <div className="analysisContainer">
            <div className="scannerEffect"></div>

            <div className="analysisPhases">
              <div className={`analysisPhase ${analysisPhase === "analyzing" ? "active" : ""}`}>
                <div className="phaseIcon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                </div>
                <div className="phaseText">
                  <div className="phaseTitle">データ解析中</div>
                  <div className="phaseSubtitle">過去の戦績を分析しています...</div>
                </div>
              </div>

              <div className={`analysisPhase ${analysisPhase === "calculating" ? "active" : ""}`}>
                <div className="phaseIcon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                </div>
                <div className="phaseText">
                  <div className="phaseTitle">勝率算出中</div>
                  <div className="phaseSubtitle">AI が最適な予測を計算しています...</div>
                </div>
              </div>

              <div className={`analysisPhase ${analysisPhase === "complete" ? "active" : ""}`}>
                <div className="phaseIcon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div className="phaseText">
                  <div className="phaseTitle">分析完了</div>
                  <div className="phaseSubtitle">予測結果を表示します</div>
                </div>
              </div>
            </div>

            <div className="progressBar">
              <div className="progressFill"></div>
            </div>

            <div className="matrixEffect">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="matrixColumn" style={{ left: `${i * 5}%` }}>
                  {Math.random().toString(36).substring(2, 15)}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 予測結果セクション */}
      {pred && showStats && (
        <section className="predictionSection animated">
          <div className="sectionHeader">
            <h2 className="sectionTitle">予測結果</h2>
            <div className="sectionSubtitle">この2時間スケジュールでの勝率とXP増減予測</div>
          </div>

          <div className="predictionContent">
            <div className={`mainPrediction ${currentStat >= 5 ? "visible" : ""}`}>
              <div className="predictionValue">{pct(animatedFinal)}</div>
              <div className="predictionLabel">予測勝率</div>
              <div className="predictionLabel">予測XP増減 {signed(animatedXpDelta)}</div>
              <div className="sparkles">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="sparkle"
                    style={
                      {
                        "--delay": `${i * 0.1}s`,
                        "--angle": `${i * 30}deg`,
                      } as SparkleStyle
                    }
                  ></div>
                ))}
              </div>
            </div>

            <div className="predictionStats">
              <div className={`predStat ${currentStat >= 1 ? "visible" : ""}`}>
                <div className="predStatLabel">基礎勝率</div>
                <div className="predStatValue">{pct(animatedBase)}</div>
                <div className="statBar">
                  <div className="statBarFill" style={{ width: `${animatedBase * 100}%` }}></div>
                </div>
              </div>

              <div className={`predStat ${currentStat >= 2 ? "visible" : ""}`}>
                <div className="predStatLabel">武器補正</div>
                <div className="predStatValue">{pct(animatedWeapon)}</div>
                <div className="statBar">
                  <div className="statBarFill" style={{ width: `${animatedWeapon * 100}%` }}></div>
                </div>
              </div>

              <div className={`predStat ${currentStat >= 3 ? "visible" : ""}`}>
                <div className="predStatLabel">ステージ補正</div>
                <div className="predStatValue">{pct(animatedStage)}</div>
                <div className="statBar">
                  <div className="statBarFill" style={{ width: `${animatedStage * 100}%` }}></div>
                </div>
              </div>

              <div className={`predStat ${currentStat >= 4 ? "visible" : ""}`}>
                <div className="predStatLabel">メンタル影響</div>
                <div className="predStatValue negative">-{pct(animatedPenalty)}</div>
                <div className="statBar danger">
                  <div className="statBarFill" style={{ width: `${animatedPenalty * 100}%` }}></div>
                </div>
              </div>

              <div className={`predStat ${currentStat >= 5 ? "visible" : ""}`}>
                <div className="predStatLabel">勝率95%信頼区間</div>
                <div className="predStatValue">
                  {pct(pred.winRateInterval.low)} - {pct(pred.winRateInterval.high)}
                </div>
              </div>

              <div className={`predStat ${currentStat >= 5 ? "visible" : ""}`}>
                <div className="predStatLabel">XP増減95%信頼区間</div>
                <div className="predStatValue">
                  {signed(pred.xpDeltaInterval.low)} - {signed(pred.xpDeltaInterval.high)}
                </div>
              </div>

              <div className={`predStat ${currentStat >= 5 ? "visible" : ""}`}>
                <div className="predStatLabel">推奨判定</div>
                <div className={`predStatValue ${pred.recommendPlay ? "" : "negative"}`}>
                  {pred.recommendPlay ? "プレイ推奨" : "見送り推奨"}
                </div>
              </div>
            </div>

            <div className={`predictionNote ${currentStat >= 5 ? "visible" : ""}`}>
              {pred.advice}
              <br />
              {pred.note}
            </div>

            {/* もう一度予測するボタン */}
            <div className={`resetButtonContainer ${currentStat >= 5 ? "visible" : ""}`}>
              <button
                type="button"
                className="resetPredictionBtn"
                onClick={() => {
                  setPred(null);
                  setShowStats(false);
                  setCurrentStat(0);
                  setAnalysisPhase("idle");
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polyline points="1 4 1 10 7 10" />
                  <polyline points="23 20 23 14 17 14" />
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
                </svg>
                条件を変えて再予測
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
