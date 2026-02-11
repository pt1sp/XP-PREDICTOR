import { useCallback, useEffect, useState } from "react";
import "./App.css";
import {
  clearAuthToken,
  fetchMe,
  fetchSessions,
  hasAuthToken,
  logout,
  type AuthUser,
  type Session,
} from "./api";
import Navigation from "./Navigation";
import PredictView from "./PredictView";
import RecordView from "./RecordView";
import HistoryView from "./HistoryView";
import AuthView from "./AuthView";
import AdminView from "./AdminView";
import type { ViewType } from "./types";

export default function App() {
  const [currentView, setCurrentView] = useState<ViewType>("predict");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const isAdmin = user?.role === "ADMIN";

  const reload = useCallback(async () => {
    if (!user) return;

    try {
      setSessions(await fetchSessions());
      setMsg("");
    } catch (e) {
      setMsg(`データ取得に失敗: ${String(e)}`);
    }
  }, [user]);

  useEffect(() => {
    async function bootstrapAuth() {
      if (!hasAuthToken()) {
        setAuthLoading(false);
        return;
      }

      try {
        setUser(await fetchMe());
      } catch {
        clearAuthToken();
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    }

    void bootstrapAuth();
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!isAdmin && currentView === "admin") {
      setCurrentView("predict");
    }
  }, [currentView, isAdmin]);

  const handleRecordSaved = () => {
    void reload();
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignore logout API failure and clear local auth state.
    }
    clearAuthToken();
    setUser(null);
    setSessions([]);
    setCurrentView("predict");
  };

  if (authLoading) {
    return (
      <div className="appContainer">
        <main className="mainContent">
          <div className="emptyState">
            <p>認証状態を確認中...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="appContainer">
        <header className="appHeader">
          <div className="headerContent">
            <h1 className="appTitle">勝率予測くん</h1>
            <div className="headerBadge">AUTH</div>
          </div>
        </header>
        <main className="mainContent">
          <AuthView
            onAuthenticated={(nextUser) => {
              setUser(nextUser);
              setCurrentView("predict");
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="appContainer">
      <header className="appHeader">
        <div className="headerContent headerUserRow">
          <h1 className="appTitle">勝率予測くん</h1>
          <div className="headerBadge">{user.role}</div>
          <div className="headerUserInfo">
            <span>{user.loginId}</span>
          </div>
          <button type="button" className="quickBtn" onClick={() => void handleLogout()}>
            ログアウト
          </button>
        </div>
      </header>

      <Navigation
        currentView={currentView}
        isAdmin={isAdmin}
        onViewChange={setCurrentView}
      />

      <main className="mainContent">
        {msg && <div className="messageBox error">{msg}</div>}

        {currentView === "predict" && <PredictView />}
        {currentView === "record" && <RecordView onRecordSaved={handleRecordSaved} />}
        {currentView === "history" && <HistoryView sessions={sessions} />}
        {currentView === "admin" && isAdmin && <AdminView currentUserId={user.id} />}
      </main>
    </div>
  );
}
