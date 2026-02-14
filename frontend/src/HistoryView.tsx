import { useState, useMemo } from "react";
import { STAGES } from "./Constants";
import type { Rule, Session } from "./api";

type HistoryViewProps = {
  sessions: Session[];
  onDeleteSession: (sessionId: number) => Promise<void>;
};

type SortKey =
  | "playedAt"
  | "rule"
  | "weapon"
  | "winRate"
  | "wins"
  | "losses"
  | "fatigue"
  | "irritability"
  | "concentration"
  | "startXp"
  | "endXp";
type SortOrder = "asc" | "desc";

const DEFAULT_DISPLAY_COUNT = 20;
const RULE_OPTIONS: Rule[] = ["エリア", "ヤグラ", "ホコ", "アサリ"];

function toWinRate(session: Session): number {
  const total = session.wins + session.losses;
  if (total <= 0) return 0;
  return session.wins / total;
}

function toWinRatePercent(session: Session): number {
  return Math.round(toWinRate(session) * 100);
}

function compareSessions(a: Session, b: Session, key: SortKey): number {
  switch (key) {
    case "playedAt":
      return new Date(a.playedAt).getTime() - new Date(b.playedAt).getTime();
    case "rule":
      return a.rule.localeCompare(b.rule, "ja");
    case "weapon":
      return a.weapon.localeCompare(b.weapon, "ja");
    case "winRate":
      return toWinRate(a) - toWinRate(b);
    case "wins":
      return a.wins - b.wins;
    case "losses":
      return a.losses - b.losses;
    case "fatigue":
      return a.fatigue - b.fatigue;
    case "irritability":
      return a.irritability - b.irritability;
    case "concentration":
      return a.concentration - b.concentration;
    case "startXp":
      return a.startXp - b.startXp;
    case "endXp":
      return a.endXp - b.endXp;
    default:
      return 0;
  }
}

export default function HistoryView({ sessions, onDeleteSession }: HistoryViewProps) {
  const [displayCount, setDisplayCount] = useState(DEFAULT_DISPLAY_COUNT);
  const [sortKey, setSortKey] = useState<SortKey>("playedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterWeapon, setFilterWeapon] = useState("");
  const [filterRule, setFilterRule] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterMinWinRate, setFilterMinWinRate] = useState("");
  const [filterMaxWinRate, setFilterMaxWinRate] = useState("");
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null);

  const filteredSessions = useMemo(() => {
    const minWinRate = filterMinWinRate === "" ? null : Number(filterMinWinRate);
    const maxWinRate = filterMaxWinRate === "" ? null : Number(filterMaxWinRate);

    return sessions.filter((session) => {
      if (filterWeapon && session.weapon !== filterWeapon) {
        return false;
      }
      if (filterRule && session.rule !== filterRule) {
        return false;
      }
      if (filterStage && session.stage1 !== filterStage && session.stage2 !== filterStage) {
        return false;
      }
      const winRate = toWinRatePercent(session);
      if (minWinRate !== null && winRate < minWinRate) {
        return false;
      }
      if (maxWinRate !== null && winRate > maxWinRate) {
        return false;
      }
      return true;
    });
  }, [sessions, filterWeapon, filterRule, filterStage, filterMinWinRate, filterMaxWinRate]);

  const sortedSessions = useMemo(() => {
    const sorted = [...filteredSessions];
    sorted.sort((a, b) => {
      const result = compareSessions(a, b, sortKey);
      return sortOrder === "asc" ? result : -result;
    });
    return sorted;
  }, [filteredSessions, sortKey, sortOrder]);

  const displayedSessions = sortedSessions.slice(0, displayCount);
  const hasMore = sortedSessions.length > displayCount;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const resetFilters = () => {
    setFilterWeapon("");
    setFilterRule("");
    setFilterStage("");
    setFilterMinWinRate("");
    setFilterMaxWinRate("");
  };

  const allWeapons = useMemo(() => {
    const weaponSet = new Set(sessions.map((s) => s.weapon));
    return Array.from(weaponSet).sort((a, b) => a.localeCompare(b, "ja"));
  }, [sessions]);

  const getSortIcon = (key: SortKey) => {
    if (sortKey !== key) {
      return (
        <svg className="sortIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
        </svg>
      );
    }
    if (sortOrder === "asc") {
      return (
        <svg className="sortIcon active" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M8 15l4 4 4-4" />
        </svg>
      );
    }

    return (
      <svg className="sortIcon active" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M8 9l4-4 4 4" />
      </svg>
    );
  };

  const handleDelete = async (sessionId: number) => {
    if (deletingSessionId !== null) return;
    const ok = window.confirm("この試合記録を削除しますか？");
    if (!ok) return;

    setDeletingSessionId(sessionId);
    try {
      await onDeleteSession(sessionId);
    } finally {
      setDeletingSessionId(null);
    }
  };

  const formatPlayedAt = (playedAt: string) =>
    new Date(playedAt).toLocaleString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="viewContainer historyViewContainer">
      <section className="historySection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">プレイ履歴</h2>
          <div className="sectionSubtitle">
            {sortedSessions.length > 0 ? (
              <>
                全{sessions.length}件中 {sortedSessions.length}件を表示
              </>
            ) : (
              <>全{sessions.length}件</>
            )}
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="emptyState">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="9" x2="15" y2="9" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <p>まだデータがありません</p>
            <small>実績記録画面から最初のセッションを記録しましょう</small>
          </div>
        ) : (
          <>
            <div className="filterSection">
              <div className="filterHeader">
                <h3 className="filterTitle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                  フィルター
                </h3>
                {(filterWeapon || filterRule || filterStage || filterMinWinRate || filterMaxWinRate) && (
                  <button className="filterResetBtn" onClick={resetFilters}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    リセット
                  </button>
                )}
              </div>

              <div className="filterControls">
                <div className="filterGroup">
                  <label className="filterLabel">武器</label>
                  <select
                    className="filterSelect"
                    value={filterWeapon}
                    onChange={(e) => setFilterWeapon(e.target.value)}
                  >
                    <option value="">すべて</option>
                    {allWeapons.map((weapon) => (
                      <option key={weapon} value={weapon}>
                        {weapon}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filterGroup">
                  <label className="filterLabel">ルール</label>
                  <select
                    className="filterSelect"
                    value={filterRule}
                    onChange={(e) => setFilterRule(e.target.value)}
                  >
                    <option value="">すべて</option>
                    {RULE_OPTIONS.map((rule) => (
                      <option key={rule} value={rule}>
                        {rule}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filterGroup">
                  <label className="filterLabel">ステージ</label>
                  <select
                    className="filterSelect"
                    value={filterStage}
                    onChange={(e) => setFilterStage(e.target.value)}
                  >
                    <option value="">すべて</option>
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="filterGroup">
                  <label className="filterLabel">勝率（最小）</label>
                  <input
                    type="number"
                    className="filterInput"
                    placeholder="0"
                    min="0"
                    max="100"
                    value={filterMinWinRate}
                    onChange={(e) => setFilterMinWinRate(e.target.value)}
                  />
                </div>

                <div className="filterGroup">
                  <label className="filterLabel">勝率（最大）</label>
                  <input
                    type="number"
                    className="filterInput"
                    placeholder="100"
                    min="0"
                    max="100"
                    value={filterMaxWinRate}
                    onChange={(e) => setFilterMaxWinRate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {sortedSessions.length === 0 ? (
              <div className="emptyState">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <p>フィルター条件に一致するデータがありません</p>
                <small>フィルターをリセットして再度お試しください</small>
              </div>
            ) : (
              <>
                <div className="historyTableWrapper">
                  <table className="historyTable">
                    <thead>
                      <tr>
                        <th onClick={() => handleSort("playedAt")} className="sortable">
                          日時 {getSortIcon("playedAt")}
                        </th>
                        <th onClick={() => handleSort("weapon")} className="sortable">
                          武器 {getSortIcon("weapon")}
                        </th>
                        <th onClick={() => handleSort("rule")} className="sortable">
                          ルール {getSortIcon("rule")}
                        </th>
                        <th>ステージ1</th>
                        <th>ステージ2</th>
                        <th onClick={() => handleSort("wins")} className="sortable">
                          勝 {getSortIcon("wins")}
                        </th>
                        <th onClick={() => handleSort("losses")} className="sortable">
                          敗 {getSortIcon("losses")}
                        </th>
                        <th onClick={() => handleSort("winRate")} className="sortable">
                          勝率 {getSortIcon("winRate")}
                        </th>
                        <th onClick={() => handleSort("fatigue")} className="sortable">
                          疲労 {getSortIcon("fatigue")}
                        </th>
                        <th onClick={() => handleSort("irritability")} className="sortable">
                          イライラ {getSortIcon("irritability")}
                        </th>
                        <th onClick={() => handleSort("concentration")} className="sortable">
                          集中 {getSortIcon("concentration")}
                        </th>
                        <th onClick={() => handleSort("startXp")} className="sortable">
                          開始XP {getSortIcon("startXp")}
                        </th>
                        <th onClick={() => handleSort("endXp")} className="sortable">
                          終了XP {getSortIcon("endXp")}
                        </th>
                        <th>メモ</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedSessions.map((s) => {
                        const total = s.wins + s.losses;
                        const winRate = toWinRatePercent(s);

                        return (
                          <tr key={s.id}>
                            <td className="historyDate">{formatPlayedAt(s.playedAt)}</td>
                            <td className="historyWeapon">{s.weapon}</td>
                            <td className="historyMental">{s.rule}</td>
                            <td className="historyStage">{s.stage1}</td>
                            <td className="historyStage">{s.stage2}</td>
                            <td className="historyWins">{s.wins}</td>
                            <td className="historyLosses">{s.losses}</td>
                            <td className="historyWinRate">{total > 0 ? `${winRate}%` : "-"}</td>
                            <td className="historyMental">{s.fatigue}</td>
                            <td className="historyMental">{s.irritability}</td>
                            <td className="historyMental">{s.concentration}</td>
                            <td className="historyMental">{s.startXp}</td>
                            <td className="historyMental">{s.endXp}</td>
                            <td className="historyMemo" title={s.memo || "-"}>
                              <span className="historyMemoText">{s.memo || "-"}</span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="quickBtn"
                                disabled={deletingSessionId === s.id}
                                onClick={() => void handleDelete(s.id)}
                              >
                                {deletingSessionId === s.id ? "削除中..." : "削除"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="historyList">
                  {displayedSessions.map((s) => {
                    const total = s.wins + s.losses;
                    const winRate = toWinRatePercent(s);
                    return (
                      <details key={`card-${s.id}`} className="historyCard">
                        <summary className="historyCardSummary">
                          <span className="historyDate">{formatPlayedAt(s.playedAt)}</span>
                          <span className="historyWeapon">{s.weapon}</span>
                          <span className="historyWinRate">
                            {total > 0 ? `${winRate}%` : "-"}
                          </span>
                        </summary>

                        <div className="historyCardDetails">
                          <div className="historyRow">
                            <span>ルール</span>
                            <strong>{s.rule}</strong>
                          </div>
                          <div className="historyRow">
                            <span>ステージ</span>
                            <strong>
                              {s.stage1} / {s.stage2}
                            </strong>
                          </div>
                          <div className="historyRow">
                            <span>勝敗</span>
                            <strong>
                              {s.wins}勝 {s.losses}敗
                            </strong>
                          </div>
                          <div className="historyRow">
                            <span>メンタル</span>
                            <strong>
                              疲労{s.fatigue} / イライラ{s.irritability} / 集中{s.concentration}
                            </strong>
                          </div>
                          <div className="historyRow">
                            <span>XP</span>
                            <strong>
                              {s.startXp} → {s.endXp}
                            </strong>
                          </div>
                          <div className="historyMemoCard">{s.memo || "-"}</div>
                          <button
                            type="button"
                            className="quickBtn historyDeleteBtn"
                            disabled={deletingSessionId === s.id}
                            onClick={() => void handleDelete(s.id)}
                          >
                            {deletingSessionId === s.id ? "削除中..." : "削除"}
                          </button>
                        </div>
                      </details>
                    );
                  })}
                </div>

                {hasMore && (
                  <div className="loadMoreSection">
                    <button className="loadMoreBtn" onClick={() => setDisplayCount((prev) => prev + 20)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      さらに20件表示（残り{sortedSessions.length - displayCount}件）
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
