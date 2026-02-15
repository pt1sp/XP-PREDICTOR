import type { ViewType } from "./types";

type NavigationProps = {
  currentView: ViewType;
  isAdmin: boolean;
  onViewChange: (view: ViewType) => void;
};

export default function Navigation({
  currentView,
  isAdmin,
  onViewChange,
}: NavigationProps) {
  return (
    <nav className="navigation">
      <button
        type="button"
        className={`navBtn ${currentView === "predict" ? "active" : ""}`}
        onClick={() => onViewChange("predict")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span>予測</span>
      </button>

      <button
        type="button"
        className={`navBtn ${currentView === "record" ? "active" : ""}`}
        onClick={() => onViewChange("record")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <span>記録</span>
      </button>

      <button
        type="button"
        className={`navBtn ${currentView === "history" ? "active" : ""}`}
        onClick={() => onViewChange("history")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>履歴</span>
      </button>

      <button
        type="button"
        className={`navBtn ${currentView === "settings" ? "active" : ""}`}
        onClick={() => onViewChange("settings")}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
          <path d="M19.4 15a7.8 7.8 0 0 0 .1-1l2-1.5-2-3.5-2.4.8a7.7 7.7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.7 7.7 0 0 0-1.7 1L4.5 9 2.5 12.5l2 1.5a7.8 7.8 0 0 0 .1 1l-2 1.5 2 3.5 2.4-.8c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4.8 2-3.5-2-1.5z" />
        </svg>
        <span>設定</span>
      </button>

      {isAdmin && (
        <button
          type="button"
          className={`navBtn ${currentView === "admin" ? "active" : ""}`}
          onClick={() => onViewChange("admin")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 3l9 4.5-9 4.5-9-4.5L12 3z" />
            <path d="M3 12l9 4.5 9-4.5" />
            <path d="M3 16.5L12 21l9-4.5" />
          </svg>
          <span>管理</span>
        </button>
      )}
    </nav>
  );
}
