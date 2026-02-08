import { useEffect, useMemo, useState } from "react";
import {
  fetchAdminSessions,
  fetchAdminUsers,
  updateUserRole,
  type AdminUser,
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
