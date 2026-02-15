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
import "./AdminView.css";

type AdminViewProps = {
  currentUserId: number;
  onNavigateToMatches: () => void;
};

function formatDateTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("ja-JP");
}

export default function AdminView({ currentUserId, onNavigateToMatches }: AdminViewProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sessions, setSessions] = useState<SessionWithUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | "">("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null);

  const [evalResult, setEvalResult] = useState<OfflineEvaluationResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [warmup, setWarmup] = useState(6);
  const [evalLimit, setEvalLimit] = useState(120);

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
      setMsg(`Failed to load admin data: ${String(err)}`);
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
      setMsg(`Failed to change role: ${String(err)}`);
    }
  }

  async function handleDeleteSession(sessionId: number) {
    if (deletingSessionId !== null) return;
    const ok = window.confirm("Delete this session?");
    if (!ok) return;

    setDeletingSessionId(sessionId);
    try {
      await deleteAdminSession(sessionId);
      await reload(selectedUserId === "" ? undefined : selectedUserId);
    } catch (err) {
      setMsg(`Failed to delete session: ${String(err)}`);
    } finally {
      setDeletingSessionId(null);
    }
  }

  async function runOfflineEvaluation() {
    if (selectedUserId === "") {
      setMsg("Select a target user first.");
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
      setMsg(`Offline evaluation failed: ${String(err)}`);
      setEvalResult(null);
    } finally {
      setEvalLoading(false);
    }
  }

  const pct = (value: number) => `${Math.round(value * 1000) / 10}%`;
  const signed = (value: number) => `${value >= 0 ? "+" : ""}${Math.round(value)}`;

  return (
    <div className="viewContainer adminViewContainer adminPageContainer">
      <section className="historySection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">Admin</h2>
          <div className="sectionSubtitle">Users, sessions, and offline evaluation</div>
        </div>

        {msg && <div className="messageBox error">{msg}</div>}

        <div className="filterSection" style={{ marginTop: 10 }}>
          <div className="filterControls">
            <div className="filterGroup">
              <label className="filterLabel">SplatNet3 Matches</label>
              <button type="button" className="quickBtn" onClick={onNavigateToMatches}>
                Open matches
              </button>
            </div>
          </div>
        </div>

        <div className="filterSection">
          <div className="filterControls">
            <div className="filterGroup">
              <label className="filterLabel">Target user</label>
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
                <option value="">All users</option>
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
            <h3 className="filterTitle">Users</h3>
            <div className="adminList">
              {users.map((u) => (
                <div className="adminListItem" key={u.id}>
                  <div>
                    <strong>{u.loginId}</strong>
                    <small>
                      Role: {u.role} / Sessions: {u._count.sessions}
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
              Sessions {targetUser ? `(${targetUser.loginId})` : "(All users)"}
            </h3>

            {loading ? (
              <div className="emptyState">
                <p>Loading...</p>
              </div>
            ) : sessions.length === 0 ? (
              <div className="emptyState">
                <p>No sessions.</p>
              </div>
            ) : (
              <>
                <div className="historyTableWrapper adminTableOnly">
                  <table className="historyTable">
                    <thead>
                      <tr>
                        <th>Played At</th>
                        <th>User</th>
                        <th>Weapon</th>
                        <th>W</th>
                        <th>L</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.map((s) => (
                        <tr key={s.id}>
                          <td>{formatDateTime(s.playedAt)}</td>
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
                              {deletingSessionId === s.id ? "Deleting..." : "Delete"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="adminSessionList adminMobileOnly">
                  {sessions.map((s) => (
                    <details key={`admin-session-${s.id}`} className="historyCard">
                      <summary className="historyCardSummary">
                        <span className="historyDate">{formatDateTime(s.playedAt)}</span>
                        <span className="historyWeapon">{s.weapon}</span>
                        <span className="historyWinRate">
                          {s.wins}W {s.losses}L
                        </span>
                      </summary>
                      <div className="historyCardDetails">
                        <div className="historyRow">
                          <span>User</span>
                          <strong>{s.user?.loginId ?? "-"}</strong>
                        </div>
                        <button
                          className="quickBtn historyDeleteBtn"
                          type="button"
                          disabled={deletingSessionId === s.id}
                          onClick={() => void handleDeleteSession(s.id)}
                        >
                          {deletingSessionId === s.id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </details>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="adminCard" style={{ marginTop: 20 }}>
          <h3 className="filterTitle">Offline evaluation</h3>

          <div className="filterControls">
            <div className="filterGroup">
              <label className="filterLabel">Warmup</label>
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
              <label className="filterLabel">Limit</label>
              <input
                className="filterInput"
                type="number"
                min={20}
                max={500}
                value={evalLimit}
                onChange={(e) => setEvalLimit(Math.max(20, Math.min(500, Number(e.target.value) || 120)))}
              />
            </div>
            <div className="filterGroup">
              <label className="filterLabel">Run</label>
              <button className="quickBtn" type="button" disabled={evalLoading} onClick={() => void runOfflineEvaluation()}>
                {evalLoading ? "Running..." : "Run evaluation"}
              </button>
            </div>
          </div>

          {evalResult && (
            <>
              <div className="historyTableWrapper" style={{ marginTop: 12 }}>
                <table className="historyTable">
                  <thead>
                    <tr>
                      <th>Evaluated</th>
                      <th>WinRate MAE</th>
                      <th>WinRate RMSE</th>
                      <th>XP MAE</th>
                      <th>XP RMSE</th>
                      <th>WinRate CI cov</th>
                      <th>XP CI cov</th>
                      <th>Rec precision</th>
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

              <div className="adminEvalSummary adminMobileOnly" style={{ marginTop: 12 }}>
                <div className="historyCardDetails">
                  <div className="historyRow"><span>Evaluated</span><strong>{evalResult.evaluatedCount}</strong></div>
                  <div className="historyRow"><span>WinRate MAE</span><strong>{pct(evalResult.summary.maeWinRate)}</strong></div>
                  <div className="historyRow"><span>WinRate RMSE</span><strong>{pct(evalResult.summary.rmseWinRate)}</strong></div>
                  <div className="historyRow"><span>XP MAE</span><strong>{Math.round(evalResult.summary.maeXpDelta)}</strong></div>
                  <div className="historyRow"><span>XP RMSE</span><strong>{Math.round(evalResult.summary.rmseXpDelta)}</strong></div>
                  <div className="historyRow"><span>WinRate CI cov</span><strong>{pct(evalResult.summary.winRateCoverage)}</strong></div>
                  <div className="historyRow"><span>XP CI cov</span><strong>{pct(evalResult.summary.xpDeltaCoverage)}</strong></div>
                  <div className="historyRow"><span>Rec precision</span><strong>{pct(evalResult.summary.recommendationPrecision)}</strong></div>
                </div>
              </div>

              <div className="historyTableWrapper" style={{ marginTop: 12 }}>
                <table className="historyTable">
                  <thead>
                    <tr>
                      <th>Played At</th>
                      <th>Rule</th>
                      <th>Weapon</th>
                      <th>Pred WinRate</th>
                      <th>Actual WinRate</th>
                      <th>WinRate 95%CI</th>
                      <th>Pred XP d</th>
                      <th>Actual XP d</th>
                      <th>XP 95%CI</th>
                      <th>Rec</th>
                      <th>Comment</th>
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
                        <td>{row.recommendPlay ? "Play" : "Skip"}</td>
                        <td title={row.note}>{row.advice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="adminEvalRows adminMobileOnly" style={{ marginTop: 12 }}>
                {evalResult.rows.map((row) => (
                  <details key={`eval-row-${row.sessionId}`} className="historyCard">
                    <summary className="historyCardSummary">
                      <span className="historyDate">{formatDateTime(row.playedAt)}</span>
                      <span className="historyWeapon">{row.weapon}</span>
                      <span className="historyWinRate">{pct(row.actualWinRate)}</span>
                    </summary>
                    <div className="historyCardDetails">
                      <div className="historyRow"><span>Rule</span><strong>{row.rule}</strong></div>
                      <div className="historyRow"><span>Pred WinRate</span><strong>{pct(row.predictedWinRate)}</strong></div>
                      <div className="historyRow"><span>Actual WinRate</span><strong>{pct(row.actualWinRate)}</strong></div>
                      <div className="historyRow"><span>WinRate 95%CI</span><strong>{pct(row.winRateInterval.low)} - {pct(row.winRateInterval.high)}</strong></div>
                      <div className="historyRow"><span>Pred XP d</span><strong>{signed(row.predictedXpDelta)}</strong></div>
                      <div className="historyRow"><span>Actual XP d</span><strong>{signed(row.actualXpDelta)}</strong></div>
                      <div className="historyRow"><span>XP 95%CI</span><strong>{signed(row.xpDeltaInterval.low)} - {signed(row.xpDeltaInterval.high)}</strong></div>
                      <div className="historyRow"><span>Rec</span><strong>{row.recommendPlay ? "Play" : "Skip"}</strong></div>
                      <div className="historyMemoCard">{row.advice}</div>
                    </div>
                  </details>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
