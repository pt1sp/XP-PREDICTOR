import { useMemo, useState } from "react";
import { login, register, setAuthToken, type AuthUser } from "./api";

type AuthViewProps = {
  onAuthenticated: (user: AuthUser) => void;
};

export default function AuthView({ onAuthenticated }: AuthViewProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isRegister = mode === "register";
  const passwordMismatch = isRegister && confirmPassword.length > 0 && password !== confirmPassword;

  const canSubmit = useMemo(() => {
    if (!loginId.trim()) return false;
    if (password.length < 8) return false;
    if (isRegister && password !== confirmPassword) return false;
    return true;
  }, [confirmPassword, isRegister, loginId, password]);

  function switchMode(nextMode: "login" | "register") {
    setMode(nextMode);
    setError("");
    setPassword("");
    setConfirmPassword("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");
    setLoading(true);

    try {
      const result =
        mode === "login"
          ? await login({ loginId: loginId.trim(), password })
          : await register({ loginId: loginId.trim(), password });
      setAuthToken(result.token);
      onAuthenticated(result.user);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="viewContainer">
      <section className="inputSection authSection modernAuthSection">
        <div
          className={`authModeSwitch ${mode === "register" ? "register" : "login"}`}
          role="tablist"
          aria-label="認証モード"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`authModeBtn ${mode === "login" ? "active" : ""}`}
            onClick={() => switchMode("login")}
          >
            ログイン
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`authModeBtn ${mode === "register" ? "active" : ""}`}
            onClick={() => switchMode("register")}
          >
            新規登録
          </button>
        </div>

        <div className="sectionHeader authHeader">
          <h2 className="sectionTitle authTitle">{isRegister ? "アカウント作成" : "アカウントにログイン"}</h2>
          <div className="sectionSubtitle authSubtitle">
            {isRegister
              ? "IDとパスワードを設定して、すぐに利用を開始できます"
              : "登録済みのIDとパスワードでログインします"}
          </div>
        </div>

        <form className="inputForm authForm modernAuthForm" onSubmit={onSubmit}>
          <div className="formGroup authField">
            <label className="formLabel">ログインID</label>
            <input
              className="filterInput authInput"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="your-id"
              autoComplete="username"
              required
            />
            <small className="authHint authHintGhost">8文字以上で設定してください</small>
          </div>

          <div className="formGroup authField">
            <label className="formLabel">パスワード</label>
            <div className="authInputRow">
              <input
                className="filterInput authInput"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8文字以上"
                minLength={8}
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
              />
              <button
                type="button"
                className="authRevealBtn"
                onMouseDown={() => setShowPassword(true)}
                onMouseUp={() => setShowPassword(false)}
                onMouseLeave={() => setShowPassword(false)}
                onTouchStart={() => setShowPassword(true)}
                onTouchEnd={() => setShowPassword(false)}
                aria-label="押している間パスワード表示"
                title="押している間だけ表示"
              >
                表示
              </button>
            </div>
            <small className="authHint">8文字以上で設定してください</small>
          </div>

          {isRegister && (
            <div className="formGroup authField">
              <label className="formLabel">パスワード（再入力）</label>
              <input
                className={`filterInput authInput ${passwordMismatch ? "authInputError" : ""}`}
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="もう一度入力"
                minLength={8}
                autoComplete="new-password"
                required
              />
              {passwordMismatch && (
                <small className="authHint authHintError">パスワードが一致しません</small>
              )}
              {!passwordMismatch && confirmPassword.length > 0 && (
                <small className="authHint authHintSuccess">パスワードが一致しています</small>
              )}
            </div>
          )}

          <div className="formActions authActions modernAuthActions">
            <button className="submitBtn authSubmit" type="submit" disabled={loading || !canSubmit}>
              {loading ? "処理中..." : isRegister ? "登録して開始" : "ログイン"}
            </button>
          </div>

          {error && (
            <div className="messageBox error" role="alert" aria-live="polite">
              {error}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
