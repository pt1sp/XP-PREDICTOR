import { useEffect, useMemo, useState } from "react";
import {
  deleteAdminSession,
  fetchAdminSessions,
  fetchAdminUsers,
  fetchOfflineEvaluation,
  updateUserRole,
  type AdminUser,
  type OfflineEvaluationResult,
  type SessionWithUser,
} from "./api";

type AdminViewProps = {
  currentUserId: number;
};

export default function AdminView({ currentUserId }: AdminViewProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sessions, setSessions] = useState<SessionWithUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | "">("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [evalResult, setEvalResult] = useState<OfflineEvaluationResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [warmup, setWarmup] = useState(6);
  const [evalLimit, setEvalLimit] = useState(120);
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null);

  async function reload(targetUserId?: number) {
    setLoading(true);
    try {
      const [nextUsers, nextSessions] = await Promise.all([
        fetchAdminUsers(),
        fetchAdminSessions(targetUserId),
      ]);
      setUsers(nextUsers);
      setSessions(nextSessions);
      setMsg("");
    } catch (err) {
      setMsg(`管理データ取得に失敗: ${String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const targetUser = useMemo(
    () => users.find((u) => u.id === selectedUserId),
    [users, selectedUserId]
  );

  async function changeRole(userId: number, role: "USER" | "ADMIN") {
    try {
      await updateUserRole(userId, role);
      await reload(selectedUserId === "" ? undefined : selectedUserId);
    } catch (err) {
      setMsg(`権限更新に失敗: ${String(err)}`);
    }
  }

  async function runOfflineEvaluation() {
    if (selectedUserId === "") {
      setMsg("オフライン評価は対象ユーザーを選択して実行してください");
      return;
    }
    setEvalLoading(true);
    try {
      const result = await fetchOfflineEvaluation({
        userId: selectedUserId,
        warmup,
        limit: evalLimit,
      });
      setEvalResult(result);
      setMsg("");
    } catch (err) {
      setMsg(`オフライン評価に失敗: ${String(err)}`);
      setEvalResult(null);
    } finally {
      setEvalLoading(false);
    }
  }

  async function handleDeleteSession(sessionId: number) {
    if (deletingSessionId !== null) return;
    const ok = window.confirm("この試合記録を削除しますか？");
    if (!ok) return;

    setDeletingSessionId(sessionId);
    try {
      await deleteAdminSession(sessionId);
      await reload(selectedUserId === "" ? undefined : selectedUserId);
    } catch (err) {
      setMsg(`記録削除に失敗: ${String(err)}`);
    } finally {
      setDeletingSessionId(null);
    }
  }

  const pct = (value: number) => `${Math.round(value * 1000) / 10}%`;
  const signed = (value: number) => `${value >= 0 ? "+" : ""}${Math.round(value)}`;

  return (
    <div className="viewContainer">
      <section className="historySection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">管理者ビュー</h2>
          <div className="sectionSubtitle">ユーザー管理と全体履歴の確認</div>
        </div>

        {msg && <div className="messageBox error">{msg}</div>}

        <div className="filterSection">
          <div className="filterControls">
            <div className="filterGroup">
              <label className="filterLabel">対象ユーザー</label>
              <select
                className="filterSelect"
                value={selectedUserId}
                onChange={(e) => {
                  const value = e.target.value;
                  const nextId = value ? Number(value) : "";
                  setSelectedUserId(nextId);
                  void reload(typeof nextId === "number" ? nextId : undefined);
                }}
              >
                <option value="">全ユーザー</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.loginId}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="adminGrid">
          <div className="adminCard">
            <h3 className="filterTitle">ユーザー一覧</h3>
            <div className="adminList">
              {users.map((u) => (
                <div className="adminListItem" key={u.id}>
                  <div>
                    <strong>{u.loginId}</strong>
                    <small>
                      ロール: {u.role} / 記録: {u._count.sessions}件
                    </small>
                  </div>
                  <div className="adminActions">
                    {u.loginId !== "administrator" && (
                      <button
                        className="quickBtn"
                        type="button"
                        disabled={u.role === "USER"}
                        onClick={() => void changeRole(u.id, "USER")}
                      >
                        USER
                      </button>
                    )}
                    <button
                      className="quickBtn"
                      type="button"
                      disabled={u.role === "ADMIN"}
                      onClick={() => void changeRole(u.id, "ADMIN")}
                    >
                      ADMIN
                    </button>
                    {u.id === currentUserId && <span className="headerBadge">YOU</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="adminCard">
            <h3 className="filterTitle">
              履歴一覧 {targetUser ? `(${targetUser.loginId})` : "(全ユーザー)"}
            </h3>
            {loading ? (
              <div className="emptyState">
                <p>読み込み中...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="emptyState">
                <p>表示データがありません</p>
              </div>
            ) : (
              <div className="historyTableWrapper">
                <table className="historyTable">
                  <thead>
                    <tr>
                      <th>日時</th>
                      <th>ユーザー</th>
                      <th>武器</th>
                      <th>勝</th>
                      <th>敗</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id}>
                        <td>{new Date(s.playedAt).toLocaleString("ja-JP")}</td>
                        <td>{s.user?.loginId ?? "-"}</td>
                        <td>{s.weapon}</td>
                        <td className="historyWins">{s.wins}</td>
                        <td className="historyLosses">{s.losses}</td>
                        <td>
                          <button
                            className="quickBtn"
                            type="button"
                            disabled={deletingSessionId === s.id}
                            onClick={() => void handleDeleteSession(s.id)}
                          >
                            {deletingSessionId === s.id ? "削除中..." : "削除"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="adminCard" style={{ marginTop: 20 }}>
          <h3 className="filterTitle">オフライン評価（時系列バックテスト）</h3>
          <div className="filterControls">
            <div className="filterGroup">
              <label className="filterLabel">ウォームアップ件数</label>
              <input
                className="filterInput"
                type="number"
                min={3}
                max={30}
                value={warmup}
                onChange={(e) => setWarmup(Math.max(3, Math.min(30, Number(e.target.value) || 6)))}
              />
            </div>
            <div className="filterGroup">
              <label className="filterLabel">評価件数上限</label>
              <input
                className="filterInput"
                type="number"
                min={20}
                max={500}
                value={evalLimit}
                onChange={(e) =>
                  setEvalLimit(Math.max(20, Math.min(500, Number(e.target.value) || 120)))
                }
              />
            </div>
            <div className="filterGroup">
              <label className="filterLabel">実行</label>
              <button className="quickBtn" type="button" disabled={evalLoading} onClick={() => void runOfflineEvaluation()}>
                {evalLoading ? "評価中..." : "オフライン評価を実行"}
              </button>
            </div>
          </div>

          {evalResult && (
            <>
              <div className="historyTableWrapper" style={{ marginTop: 12 }}>
                <table className="historyTable">
                  <thead>
                    <tr>
                      <th>評価件数</th>
                      <th>勝率MAE</th>
                      <th>勝率RMSE</th>
                      <th>XP MAE</th>
                      <th>XP RMSE</th>
                      <th>勝率CI被覆率</th>
                      <th>XP CI被覆率</th>
                      <th>推奨精度</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{evalResult.evaluatedCount}</td>
                      <td>{pct(evalResult.summary.maeWinRate)}</td>
                      <td>{pct(evalResult.summary.rmseWinRate)}</td>
                      <td>{Math.round(evalResult.summary.maeXpDelta)}</td>
                      <td>{Math.round(evalResult.summary.rmseXpDelta)}</td>
                      <td>{pct(evalResult.summary.winRateCoverage)}</td>
                      <td>{pct(evalResult.summary.xpDeltaCoverage)}</td>
                      <td>{pct(evalResult.summary.recommendationPrecision)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="historyTableWrapper" style={{ marginTop: 12 }}>
                <table className="historyTable">
                  <thead>
                    <tr>
                      <th>日時</th>
                      <th>ルール</th>
                      <th>武器</th>
                      <th>予測勝率</th>
                      <th>実績勝率</th>
                      <th>勝率95%CI</th>
                      <th>予測XP増減</th>
                      <th>実績XP増減</th>
                      <th>XP95%CI</th>
                      <th>推奨</th>
                      <th>コメント</th>
                    </tr>
                  </thead>
                  <tbody>
                    {evalResult.rows.map((row) => (
                      <tr key={row.sessionId}>
                        <td>{new Date(row.playedAt).toLocaleString("ja-JP")}</td>
                        <td>{row.rule}</td>
                        <td>{row.weapon}</td>
                        <td>{pct(row.predictedWinRate)}</td>
                        <td>{pct(row.actualWinRate)}</td>
                        <td>
                          {pct(row.winRateInterval.low)} - {pct(row.winRateInterval.high)}
                        </td>
                        <td>{signed(row.predictedXpDelta)}</td>
                        <td>{signed(row.actualXpDelta)}</td>
                        <td>
                          {signed(row.xpDeltaInterval.low)} - {signed(row.xpDeltaInterval.high)}
                        </td>
                        <td>{row.recommendPlay ? "推奨" : "非推奨"}</td>
                        <td title={row.note}>{row.advice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

