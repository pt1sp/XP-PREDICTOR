import { useState, useMemo } from "react";
import { createSession } from "./api";
import type { SessionInput } from "./api";
import {
  STAGES,
  WEAPON_CATEGORIES,
  getWeaponCategory,
  getStageImagePath,
  getWeaponImagePath,
} from "./Constants";

type PickerKind = "stage1" | "stage2" | "weapon";
type CounterKey = "wins" | "losses";
type MentalKey = "fatigue" | "irritability";
type DateParts = { y: string; m: string; day: string; h: string };
type DatePartKey = keyof DateParts;

const MENTAL_SCALE = [1, 2, 3, 4, 5] as const;
const QUICK_COUNTER_DELTAS = [-10, -5, +5, +10] as const;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalHour00(d = new Date()) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const h = pad2(d.getHours());
  return `${y}-${m}-${day}T${h}:00`;
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function partsFromPlayedAt(playedAt: string): DateParts {
  const date = new Date(playedAt);
  return {
    y: String(date.getFullYear()),
    m: String(date.getMonth() + 1),
    day: String(date.getDate()),
    h: String(date.getHours()),
  };
}

function daysInMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}

type RecordViewProps = {
  onRecordSaved: () => void;
};

function buildInitialForm(): SessionInput {
  return {
    playedAt: toLocalHour00(),
    stage1: "",
    stage2: "",
    weapon: "",
    wins: 0,
    losses: 0,
    fatigue: 3,
    irritability: 3,
    memo: "",
  };
}

export default function RecordView({ onRecordSaved }: RecordViewProps) {
  const [form, setForm] = useState<SessionInput>(buildInitialForm);

  const [msg, setMsg] = useState<string>("");
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<PickerKind | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [weaponCat, setWeaponCat] = useState<string>(
    WEAPON_CATEGORIES[0]?.key ?? "shooter"
  );

  const stageCandidates = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return [...STAGES];
    return STAGES.filter((s) => s.toLowerCase().includes(q));
  }, [pickerQuery]);

  const weaponCandidates = useMemo(() => {
    const cat =
      WEAPON_CATEGORIES.find((c) => c.key === weaponCat) ?? WEAPON_CATEGORIES[0];
    const list = cat?.weapons ?? [];
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((w) => w.toLowerCase().includes(q));
  }, [weaponCat, pickerQuery]);
  const [dateText, setDateText] = useState(() => partsFromPlayedAt(form.playedAt));

  const resetForm = () => {
    const nextForm = buildInitialForm();
    setForm(nextForm);
    setDateText(partsFromPlayedAt(nextForm.playedAt));
    setMsg("");
  };
  
  const updateForm = <K extends keyof SessionInput>(key: K, value: SessionInput[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const updateDatePart = (key: DatePartKey, value: string) => {
    setDateText(prev => ({ ...prev, [key]: value }));
  };

  const updateCounter = (key: CounterKey, delta: number) => {
    setForm(prev => ({
      ...prev,
      [key]: clampInt(prev[key] + delta, 0, 99),
    }));
  };

  const setCounter = (key: CounterKey, rawValue: string) => {
    updateForm(key, clampInt(Number(rawValue || 0), 0, 99));
  };

  const setScale = (key: MentalKey, value: number) => {
    updateForm(key, clampInt(value, 1, 5));
  };

  const commitPlayedAt = () => {
    if (!dateText.y || !dateText.m || !dateText.day || !dateText.h) return;

    const y = clampInt(Number(dateText.y), 2020, 2099);
    const m = clampInt(Number(dateText.m), 1, 12);
    const maxDay = daysInMonth(y, m);
    const day = clampInt(Number(dateText.day), 1, maxDay);
    const h = clampInt(Number(dateText.h), 0, 23);

    setDateText({ y: String(y), m: String(m), day: String(day), h: String(h) });

    updateForm("playedAt", `${y}-${pad2(m)}-${pad2(day)}T${pad2(h)}:00`);
  };

  const applyPlayedAt = (playedAt: string) => {
    updateForm("playedAt", playedAt);
    setDateText(partsFromPlayedAt(playedAt));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    try {
      await createSession({
        ...form,
        wins: Number(form.wins),
        losses: Number(form.losses),
        fatigue: Number(form.fatigue),
        irritability: Number(form.irritability),
      });
      setSuccessModalOpen(true);
      onRecordSaved();
    } catch (e) {
      setMsg(`保存に失敗: ${String(e)}`);
    }
  }

  return (
    <div className="viewContainer">
      <section className="inputSection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">プレイ実績記録</h2>
          <div className="sectionSubtitle">
            試合結果を記録して予測精度を向上
          </div>
        </div>

        <form onSubmit={onSubmit} className="inputForm">
          {/* 日時入力 */}
          <div className="formGroup">
            <label className="formLabel">
              <svg
                className="labelIcon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              プレイ日時
            </label>

            <div className="dateTimeGroup">
              <div className="customDateInputs">
                <input
                  className="datePartInput"
                  type="number"
                  min={2020}
                  max={2099}
                  placeholder="年"
                  value={dateText.y}
                  onChange={(e) => updateDatePart("y", e.target.value)}
                  onBlur={commitPlayedAt}
                />

                <input
                  className="datePartInput short"
                  type="number"
                  min={1}
                  max={12}
                  placeholder="月"
                  value={dateText.m}
                  onChange={(e) => updateDatePart("m", e.target.value)}
                  onBlur={commitPlayedAt}
                />

                <input
                  className="datePartInput short"
                  type="number"
                  min={1}
                  max={31}
                  placeholder="日"
                  value={dateText.day}
                  onChange={(e) => updateDatePart("day", e.target.value)}
                  onBlur={commitPlayedAt}
                />

                <input
                  className="timeInput"
                  type="number"
                  min={0}
                  max={23}
                  value={dateText.h}
                  onChange={(e) => updateDatePart("h", e.target.value)}
                  onBlur={commitPlayedAt}
                />
                <span className="timeLabel">時</span>
              </div>

              <button
                type="button"
                className="quickBtn"
                onClick={() => {
                  const now = toLocalHour00();
                  applyPlayedAt(now);
                }}

              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                今
              </button>

              <button
                type="button"
                className="quickBtn"
                onClick={() => {
                  const d = new Date(form.playedAt);
                  d.setHours(d.getHours() - 1);
                  applyPlayedAt(toLocalHour00(d));
                }}
              >
                -1h
              </button>

              <button
                type="button"
                className="quickBtn"
                onClick={() => {
                  const d = new Date(form.playedAt);
                  d.setHours(d.getHours() + 1);
                  applyPlayedAt(toLocalHour00(d));
                }}
              >
                +1h
              </button>
            </div>
          </div>

          {/* ステージ選択 */}
          <div className="formGroup">
            <label className="formLabel">
              <svg
                className="labelIcon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
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
                    backgroundImage: form.stage1
                      ? `url(${getStageImagePath(form.stage1)})`
                      : undefined,
                  }}
                  onClick={() => {
                    setPickerQuery("");
                    setPickerOpen("stage1");
                  }}
                >
                  <span className="selectBtnText">
                    {form.stage1 || "選択してください"}
                  </span>
                  <svg
                    className="selectIcon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
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
                    backgroundImage: form.stage2
                      ? `url(${getStageImagePath(form.stage2)})`
                      : undefined,
                  }}
                  onClick={() => {
                    setPickerQuery("");
                    setPickerOpen("stage2");
                  }}
                >
                  <span className="selectBtnText">
                    {form.stage2 || "選択してください"}
                  </span>
                  <svg
                    className="selectIcon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* 武器選択 */}
          <div className="formGroup">
            <label className="formLabel">
              <svg
                className="labelIcon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              使用武器
            </label>

            <button
              type="button"
              className={`weaponSelectBtn ${form.weapon ? "selected" : ""}`}
              style={{
                backgroundImage: form.weapon
                  ? `url(${getWeaponImagePath(form.weapon)})`
                  : undefined,
              }}
              onClick={() => {
                setPickerQuery("");
                setPickerOpen("weapon");
              }}
            >
              <div className="weaponDisplay">
                <span className="weaponName">{form.weapon || "武器を選択"}</span>
                {form.weapon && (
                  <span className="weaponCategory">
                    {getWeaponCategory(form.weapon)?.label}
                  </span>
                )}
              </div>
              <svg
                className="selectIcon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          {/* 勝敗カウンター */}
          <div className="statsColumn">
            <div className="statCard win">
              <div className="statHeader">
                <svg
                  className="statIcon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <span className="statLabel">勝利</span>
              </div>
              <div className="counterControl">
                <button
                  type="button"
                  className="counterBtn"
                  onClick={() => updateCounter("wins", -1)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <input
                  className="counterInput"
                  inputMode="numeric"
                  value={form.wins}
                  onChange={(e) => setCounter("wins", e.target.value)}
                />
                <button
                  type="button"
                  className="counterBtn"
                  onClick={() => updateCounter("wins", +1)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
              <div className="quickCounterRow">
                {QUICK_COUNTER_DELTAS.map((delta) => (
                  <button
                    key={`wins-${delta}`}
                    type="button"
                    className="quickCounterBtn"
                    onClick={() => updateCounter("wins", delta)}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
              </div>
            </div>

            <div className="statCard loss">
              <div className="statHeader">
                <svg
                  className="statIcon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span className="statLabel">敗北</span>
              </div>
              <div className="counterControl">
                <button
                  type="button"
                  className="counterBtn"
                  onClick={() => updateCounter("losses", -1)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
                <input
                  className="counterInput"
                  inputMode="numeric"
                  value={form.losses}
                  onChange={(e) => setCounter("losses", e.target.value)}
                />
                <button
                  type="button"
                  className="counterBtn"
                  onClick={() => updateCounter("losses", +1)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              </div>
              <div className="quickCounterRow">
                {QUICK_COUNTER_DELTAS.map((delta) => (
                  <button
                    key={`losses-${delta}`}
                    type="button"
                    className="quickCounterBtn"
                    onClick={() => updateCounter("losses", delta)}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* メンタル状態 */}
          <div className="mentalColumn">
            <div className="mentalCard">
              <div className="mentalHeader">
                <svg
                  className="mentalIcon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
                <span className="mentalLabel">疲労度</span>
              </div>
              <div className="scaleControl">
                {MENTAL_SCALE.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`scaleBtn ${form.fatigue === n ? "active" : ""}`}
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
                <svg
                  className="mentalIcon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
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
                    className={`scaleBtn ${form.irritability === n ? "active" : ""
                      }`}
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
          </div>

          {/* メモ */}
          <div className="formGroup">
            <label className="formLabel">
              <svg
                className="labelIcon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              メモ(任意)
            </label>
            <textarea
              className="memoInput"
              value={form.memo ?? ""}
              onChange={(e) => updateForm("memo", e.target.value)}
              placeholder="味方編成、沼った理由、立ち回りメモなど..."
              rows={3}
            />
          </div>

          {/* 送信ボタン */}
          <div className="formActions">
            <button type="submit" className="submitBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              データを保存
            </button>
          </div>

          {msg && (
            <div
              className={`messageBox ${msg.includes("失敗") ? "error" : "success"}`}
            >
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
                      : "プレイしたステージを選択してください"}
                  </p>
                </div>
                <button
                  className="closeBtn"
                  type="button"
                  onClick={() => setPickerOpen(null)}
                >
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
                      className={`categoryTab ${c.key === weaponCat ? "active" : ""
                        }`}
                      onClick={() => setWeaponCat(c.key)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="pickerGrid">
                {(pickerOpen === "weapon" ? weaponCandidates : stageCandidates).map(
                  (name) => {
                    const current =
                      pickerOpen === "weapon"
                        ? form.weapon
                        : pickerOpen === "stage1"
                          ? form.stage1
                          : form.stage2;

                    const active = name === current;

                    return (
                      <button
                        key={name}
                        type="button"
                        className={`pickerItem ${active ? "active" : ""}`}
                        style={{
                          backgroundImage:
                            pickerOpen === "weapon"
                              ? `url(${getWeaponImagePath(name)})`
                              : `url(${getStageImagePath(name)})`,
                        }}
                        onClick={() => {
                          if (pickerOpen === "weapon")
                            updateForm("weapon", name);
                          if (pickerOpen === "stage1")
                            updateForm("stage1", name);
                          if (pickerOpen === "stage2")
                            updateForm("stage2", name);
                          setPickerOpen(null);
                        }}
                      >
                        {active && (
                          <svg
                            className="checkIcon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        <span className="pickerItemText">{name}</span>
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        )}

        {successModalOpen && (
          <div
            className="pickerOverlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                setSuccessModalOpen(false);
                resetForm();
              }
            }}
          >
            <div className="pickerModal">
              <div className="pickerHeader">
                <div>
                  <h3 className="pickerTitle">保存完了</h3>
                  <p className="pickerSubtitle">データを保存しました。</p>
                </div>
                <button
                  className="closeBtn"
                  type="button"
                  onClick={() => {
                    setSuccessModalOpen(false);
                    resetForm();
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  <span className="closeBtnLabel">閉じる</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
