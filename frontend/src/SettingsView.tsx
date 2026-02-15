import { useState } from "react";
import { createMyCollectorToken } from "./api";

export default function SettingsView() {
  const [label, setLabel] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="viewContainer adminViewContainer">
      <section className="historySection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">設定</h2>
          <div className="sectionSubtitle">協力者アップロード用トークンなど</div>
        </div>

        {msg && <div className="messageBox error">{msg}</div>}

        <div className="adminCard">
          <h3 className="filterTitle">協力者アップロード用トークン</h3>
          <div className="sectionSubtitle" style={{ marginTop: 6 }}>
            s3sで取得した `exports/results/*.json` を本番へ送るためのトークンです。Nintendoのログイン情報は送信しません。
          </div>

          <div className="filterControls" style={{ marginTop: 12 }}>
            <div className="filterGroup">
              <label className="filterLabel">ラベル（任意）</label>
              <input
                className="filterInput"
                placeholder="例: home-pc / laptop"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="filterGroup">
              <label className="filterLabel">発行</label>
              <button
                type="button"
                className="quickBtn"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  setMsg("");
                  setToken(null);
                  try {
                    const resp = await createMyCollectorToken({ label });
                    setToken(resp.token);
                    setLabel("");
                  } catch (err) {
                    setMsg(`トークン発行に失敗: ${String(err)}`);
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                {loading ? "発行中..." : "トークン発行"}
              </button>
            </div>
          </div>

          {token && (
            <div className="messageBox" style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                これは一度だけ表示されます。PCの環境変数 `XP_COLLECTOR_TOKEN` に保存してください（漏洩注意）。
              </div>
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                {token}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

