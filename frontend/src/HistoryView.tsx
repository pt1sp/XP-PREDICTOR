import { useState, useMemo } from "react";
import { STAGES } from "./Constants";
import type { Session } from "./api";

type HistoryViewProps = {
  sessions: Session[];
};

type SortKey =
  | "playedAt"
  | "weapon"
  | "winRate"
  | "wins"
  | "losses"
  | "fatigue"
  | "irritability";
type SortOrder = "asc" | "desc";

const DEFAULT_DISPLAY_COUNT = 20;

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
    default:
      return 0;
  }
}

export default function HistoryView({ sessions }: HistoryViewProps) {
  const [displayCount, setDisplayCount] = useState(DEFAULT_DISPLAY_COUNT);
  const [sortKey, setSortKey] = useState<SortKey>("playedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterWeapon, setFilterWeapon] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterMinWinRate, setFilterMinWinRate] = useState("");
  const [filterMaxWinRate, setFilterMaxWinRate] = useState("");

  const filteredSessions = useMemo(() => {
    const minWinRate = filterMinWinRate === "" ? null : Number(filterMinWinRate);
    const maxWinRate = filterMaxWinRate === "" ? null : Number(filterMaxWinRate);

    return sessions.filter(session => {
      if (filterWeapon && session.weapon !== filterWeapon) {
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
  }, [sessions, filterWeapon, filterStage, filterMinWinRate, filterMaxWinRate]);

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
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const resetFilters = () => {
    setFilterWeapon("");
    setFilterStage("");
    setFilterMinWinRate("");
    setFilterMaxWinRate("");
  };

  const allWeapons = useMemo(() => {
    const weaponSet = new Set(sessions.map(s => s.weapon));
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

  return (
    <div className="viewContainer">
      <section className="historySection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">プレイ履歴</h2>
          <div className="sectionSubtitle">
            {sortedSessions.length > 0 ? (
              <>全{sessions.length}件中 {sortedSessions.length}件を表示</>
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
            {/* フィルターセクション */}
            <div className="filterSection">
              <div className="filterHeader">
                <h3 className="filterTitle">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                  フィルター
                </h3>
                {(filterWeapon || filterStage || filterMinWinRate || filterMaxWinRate) && (
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
                    {allWeapons.map(weapon => (
                      <option key={weapon} value={weapon}>{weapon}</option>
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
                    {STAGES.map(stage => (
                      <option key={stage} value={stage}>{stage}</option>
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

            {/* テーブル表示 */}
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
                        <th onClick={() => handleSort('playedAt')} className="sortable">
                          日時 {getSortIcon('playedAt')}
                        </th>
                        <th onClick={() => handleSort('weapon')} className="sortable">
                          武器 {getSortIcon('weapon')}
                        </th>
                        <th>ステージ1</th>
                        <th>ステージ2</th>
                        <th onClick={() => handleSort('wins')} className="sortable">
                          勝 {getSortIcon('wins')}
                        </th>
                        <th onClick={() => handleSort('losses')} className="sortable">
                          敗 {getSortIcon('losses')}
                        </th>
                        <th onClick={() => handleSort('winRate')} className="sortable">
                          勝率 {getSortIcon('winRate')}
                        </th>
                        <th onClick={() => handleSort('fatigue')} className="sortable">
                          疲労 {getSortIcon('fatigue')}
                        </th>
                        <th onClick={() => handleSort('irritability')} className="sortable">
                          イライラ {getSortIcon('irritability')}
                        </th>
                        <th>メモ</th>
                      </tr>
                    </thead>
                    <tbody>
                {displayedSessions.map((s) => {
                        const total = s.wins + s.losses;
                        const winRate = toWinRatePercent(s);
                        
                        return (
                          <tr key={s.id}>
                            <td className="historyDate">
                              {new Date(s.playedAt).toLocaleString("ja-JP", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit"
                              })}
                            </td>
                            <td className="historyWeapon">{s.weapon}</td>
                            <td className="historyStage">{s.stage1}</td>
                            <td className="historyStage">{s.stage2}</td>
                            <td className="historyWins">{s.wins}</td>
                            <td className="historyLosses">{s.losses}</td>
                            <td className="historyWinRate">
                              {total > 0 ? `${winRate}%` : "-"}
                            </td>
                            <td className="historyMental">{s.fatigue}</td>
                            <td className="historyMental">{s.irritability}</td>
                            <td className="historyMemo" title={s.memo || "-"}>
                              {s.memo || "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* もっと見るボタン */}
                {hasMore && (
                  <div className="loadMoreSection">
                    <button 
                      className="loadMoreBtn"
                      onClick={() => setDisplayCount(prev => prev + 20)}
                    >
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
