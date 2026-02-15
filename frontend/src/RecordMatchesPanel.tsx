import { Fragment, useEffect, useMemo, useState } from "react";
import type { Match, MatchDetail, MatchesResponse, Session } from "./api";
import { fetchMatch, fetchMatches } from "./api";
import "./MatchesView.css";

type Props = {
  sessions: Session[];
};

type SortKey = "playedAt" | "importedAt" | "rule" | "stage" | "weapon" | "result";

type FormattedPlayer = {
  key: string;
  name: string;
  byname: string;
  weapon: string;
  isMyself: boolean;
  kill: number | null;
  death: number | null;
  assist: number | null;
  special: number | null;
  paint: number | null;
};

type FormattedMatch = {
  vsRuleName: string;
  stageName: string;
  playedTime: string;
  durationSec: number | null;
  knockout: boolean;
  judgement: string;
  myScore: number | null;
  otherScore: number | null;
  awards: string[];
  myPlayers: FormattedPlayer[];
  otherPlayers: FormattedPlayer[];
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const key of path) {
    const obj = asObject(cur);
    if (!obj) return undefined;
    cur = obj[key];
  }
  return cur;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumberOrNull(root: unknown, path: string[]): number | null {
  const v = getPath(root, path);
  return typeof v === "number" ? v : null;
}

function formatDateTime(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("ja-JP");
}

function isXMatchMode(mode: string | null | undefined) {
  const raw = String(mode ?? "").trim();
  if (!raw) return false;
  const normalized = raw.replace(/\s+/g, " ").toUpperCase();
  return (
    normalized === "X_MATCH" ||
    normalized === "X MATCH" ||
    normalized.includes("X_MATCH") ||
    normalized.includes("X MATCH")
  );
}

function dashIfEmpty(value: string | null | undefined) {
  const s = String(value ?? "").trim();
  return s ? s : "-";
}

export default function RecordMatchesPanel({ sessions }: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [query, setQuery] = useState("");
  const [filterXOnly, setFilterXOnly] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("playedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMsg, setDetailMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const resp: MatchesResponse = await fetchMatches({ limit, offset });
        if (cancelled) return;
        setMatches(resp.rows);
        setTotal(resp.total);
        setMsg("");
      } catch (err) {
        if (cancelled) return;
        setMsg(`matches の取得に失敗: ${String(err)}`);
        setMatches([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [limit, offset]);

  useEffect(() => {
    let cancelled = false;
    async function loadDetail(matchId: number) {
      setDetailLoading(true);
      setDetailMsg("");
      try {
        const resp = await fetchMatch(matchId);
        if (cancelled) return;
        setDetail(resp);
      } catch (err) {
        if (cancelled) return;
        setDetail(null);
        setDetailMsg(`詳細の取得に失敗: ${String(err)}`);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    if (selectedMatchId === null) {
      setDetail(null);
      setDetailMsg("");
      return () => {
        cancelled = true;
      };
    }

    void loadDetail(selectedMatchId);
    return () => {
      cancelled = true;
    };
  }, [selectedMatchId]);

  const visibleMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = matches.filter((m) => {
      if (filterXOnly && !isXMatchMode(m.mode)) return false;
      if (!q) return true;
      const hay = [m.externalId, m.mode, m.rule, m.stage, m.weapon, m.result]
        .map((v) => String(v ?? ""))
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const cmpIso = (a: string, b: string) => a.localeCompare(b) * dir;
    const cmpStr = (a: string, b: string) => a.localeCompare(b, "ja-JP") * dir;
    const s = (v: unknown) => String(v ?? "");

    const sorted = filtered.slice().sort((a, b) => {
      switch (sortKey) {
        case "playedAt":
          return cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        case "importedAt":
          return cmpIso(a.importedAt, b.importedAt) || cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        case "rule":
          return cmpStr(s(a.rule), s(b.rule)) || cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        case "stage":
          return cmpStr(s(a.stage), s(b.stage)) || cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        case "weapon":
          return cmpStr(s(a.weapon), s(b.weapon)) || cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        case "result":
          return cmpStr(s(a.result), s(b.result)) || cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        default:
          return 0;
      }
    });

    return sorted;
  }, [filterXOnly, matches, query, sortDir, sortKey]);

  const parsedVs = useMemo(() => {
    if (!detail?.rawJson) return null;
    try {
      const payload: unknown = JSON.parse(detail.rawJson);
      const obj = asObject(payload);
      if (!obj) return payload;

      const data = asObject(obj.data);
      if (data && data.vsHistoryDetail !== undefined) return data.vsHistoryDetail;
      if (obj.vsHistoryDetail !== undefined) return obj.vsHistoryDetail;
      return payload;
    } catch {
      return null;
    }
  }, [detail]);

  const formatted: FormattedMatch | null = useMemo(() => {
    if (!parsedVs) return null;

    const vsRuleName = readString(getPath(parsedVs, ["vsRule", "name"]));
    const stageName = readString(getPath(parsedVs, ["vsStage", "name"]));
    const playedTime = readString(getPath(parsedVs, ["playedTime"]));
    const durationSec = readNumberOrNull(parsedVs, ["duration"]);
    const knockout = Boolean(getPath(parsedVs, ["knockout"]));
    const judgement = readString(getPath(parsedVs, ["judgement"]));

    const myTeam = getPath(parsedVs, ["myTeam"]);
    const otherTeam = asArray(getPath(parsedVs, ["otherTeams"]))[0];

    const teamScore = (t: unknown) => readNumberOrNull(t, ["result", "score"]);

    const myScore = teamScore(myTeam);
    const otherScore = teamScore(otherTeam);

    const awards = asArray(getPath(parsedVs, ["awards"]))
      .map((a) => readString(getPath(a, ["name"])).trim())
      .filter(Boolean);

    const mapPlayers = (t: unknown): FormattedPlayer[] => {
      const ps = asArray(getPath(t, ["players"]));
      return ps.map((p) => {
        const weapon = readString(getPath(p, ["weapon", "name"])).trim();
        const name = readString(getPath(p, ["name"])).trim();
        const byname = readString(getPath(p, ["byname"])).trim();
        const isMyself = Boolean(getPath(p, ["isMyself"]));
        return {
          key: String(getPath(p, ["id"]) ?? `${name}-${weapon}`),
          name,
          byname,
          weapon,
          isMyself,
          kill: readNumberOrNull(p, ["result", "kill"]),
          death: readNumberOrNull(p, ["result", "death"]),
          assist: readNumberOrNull(p, ["result", "assist"]),
          special: readNumberOrNull(p, ["result", "special"]),
          paint: readNumberOrNull(p, ["result", "paint"]),
        };
      });
    };

    return {
      vsRuleName,
      stageName,
      playedTime,
      durationSec,
      knockout,
      judgement,
      myScore,
      otherScore,
      awards,
      myPlayers: mapPlayers(myTeam),
      otherPlayers: mapPlayers(otherTeam),
    };
  }, [parsedVs]);

  const prettyRawJson = useMemo(() => {
    if (!detail?.rawJson) return "";
    try {
      const parsed = JSON.parse(detail.rawJson) as unknown;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return detail.rawJson;
    }
  }, [detail]);

  const hasPrev = offset > 0;
  const hasNext = offset + matches.length < total;

  const resultClass = (result: string | null | undefined) => {
    const r = String(result ?? "").toUpperCase();
    if (r.includes("WIN")) return "matchResult matchResultWin";
    if (r.includes("LOSE") || r.includes("LOSS")) return "matchResult matchResultLose";
    return "matchResult matchResultOther";
  };

  const manualRows = useMemo(() => {
    const rows = sessions.slice().sort((a, b) => {
      const d = String(b.playedAt).localeCompare(String(a.playedAt));
      if (d !== 0) return d;
      return (b.id ?? 0) - (a.id ?? 0);
    });
    return rows.slice(0, 20);
  }, [sessions]);

  return (
    <section className="historySection" style={{ marginTop: 16 }}>
      <div className="sectionHeader">
        <h2 className="sectionTitle">SplatNet3 matches (s3s)</h2>
        <div className="sectionSubtitle">DB に保存された s3s 結果を表示します</div>
      </div>

      {msg && <div className="messageBox error">{msg}</div>}

      <div className="filterSection">
        <div className="filterControls">
          <div className="filterGroup">
            <label className="filterLabel">表示件数</label>
            <select
              className="filterSelect"
              value={limit}
              onChange={(e) => {
                const next = Number(e.target.value) || 50;
                setLimit(next);
                setOffset(0);
              }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>

          <div className="filterGroup">
            <label className="filterLabel">Search</label>
            <input
              className="filterInput"
              value={query}
              placeholder="rule / stage / weapon / externalId"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="filterGroup">
            <label className="filterLabel">Mode</label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={filterXOnly}
                onChange={(e) => setFilterXOnly(e.target.checked)}
              />
              X only
            </label>
          </div>

          <div className="filterGroup">
            <label className="filterLabel">Sort</label>
            <select
              className="filterSelect"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="playedAt">Played At</option>
              <option value="importedAt">Imported At</option>
              <option value="rule">Rule</option>
              <option value="stage">Stage</option>
              <option value="weapon">Weapon</option>
              <option value="result">Result</option>
            </select>
          </div>

          <div className="filterGroup">
            <label className="filterLabel">Dir</label>
            <select
              className="filterSelect"
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value === "asc" ? "asc" : "desc")}
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>

          <div className="filterGroup">
            <label className="filterLabel">Paging</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                className="quickBtn"
                disabled={!hasPrev || loading}
                onClick={() => setOffset((v) => Math.max(0, v - limit))}
              >
                Prev
              </button>
              <button
                type="button"
                className="quickBtn"
                disabled={!hasNext || loading}
                onClick={() => setOffset((v) => v + limit)}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="emptyState">
          <p>読み込み中...</p>
        </div>
      ) : visibleMatches.length === 0 ? (
        <div className="emptyState">
          <p>matches がありません</p>
        </div>
      ) : (
        <div className="historyTableWrapper">
          <table className="historyTable">
            <thead>
              <tr>
                <th>Played At</th>
                <th>Rule</th>
                <th>Stage</th>
                <th>Weapon</th>
                <th>Result</th>
                <th>Imported At</th>
              </tr>
            </thead>
            <tbody>
              {visibleMatches.map((m) => {
                const active = m.id === selectedMatchId;
                return (
                  <Fragment key={m.id}>
                    <tr
                      onClick={() => setSelectedMatchId((current) => (current === m.id ? null : m.id))}
                      style={{
                        cursor: "pointer",
                        background: active ? "rgba(0,0,0,0.06)" : undefined,
                      }}
                      title="クリックで詳細表示"
                    >
                      <td className="historyDate">{formatDateTime(m.playedAt)}</td>
                      <td className="textMuted">{dashIfEmpty(m.rule)}</td>
                      <td className="historyStage">{dashIfEmpty(m.stage)}</td>
                      <td className="historyWeapon">{dashIfEmpty(m.weapon)}</td>
                      <td className={resultClass(m.result)}>{dashIfEmpty(m.result)}</td>
                      <td className="textMuted">{m.importedAt ? formatDateTime(m.importedAt) : "-"}</td>
                    </tr>

                    {active && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0 }}>
                          <div className="adminCard" style={{ margin: 0, borderRadius: 0 }}>
                            <h3 className="filterTitle">詳細</h3>
                            {detailMsg && <div className="messageBox error">{detailMsg}</div>}
                            {detailLoading && (!detail || detail.id !== m.id) ? (
                              <div className="emptyState">
                                <p>詳細を読み込み中...</p>
                              </div>
                            ) : !detail || detail.id !== m.id ? (
                              <div className="emptyState">
                                <p>詳細がありません</p>
                              </div>
                            ) : (
                              <>
                                <div className="historyCardDetails">
                                  <div className="historyRow">
                                    <span>ID</span>
                                    <strong>{detail.id}</strong>
                                  </div>
                                  <div className="historyRow">
                                    <span>External ID</span>
                                    <strong className="monoText">{detail.externalId}</strong>
                                  </div>
                                  <div className="historyRow">
                                    <span>Played At</span>
                                    <strong>{formatDateTime(detail.playedAt)}</strong>
                                  </div>
                                  <div className="historyRow">
                                    <span>Mode</span>
                                    <strong>{dashIfEmpty(detail.mode)}</strong>
                                  </div>
                                  <div className="historyRow">
                                    <span>Rule</span>
                                    <strong>{dashIfEmpty(detail.rule)}</strong>
                                  </div>
                                  <div className="historyRow">
                                    <span>Stage</span>
                                    <strong>{dashIfEmpty(detail.stage)}</strong>
                                  </div>
                                  <div className="historyRow">
                                    <span>Weapon</span>
                                    <strong>{dashIfEmpty(detail.weapon)}</strong>
                                  </div>
                                  <div className="historyRow">
                                    <span>Result</span>
                                    <strong className={resultClass(detail.result)}>{dashIfEmpty(detail.result)}</strong>
                                  </div>
                                  <div className="historyRow">
                                    <span>Imported At</span>
                                    <strong>{detail.importedAt ? formatDateTime(detail.importedAt) : "-"}</strong>
                                  </div>
                                </div>

                                {formatted && (
                                  <>
                                    <div className="adminCard" style={{ marginTop: 12 }}>
                                      <h3 className="filterTitle">VS Summary</h3>
                                      <div className="historyCardDetails">
                                        <div className="historyRow">
                                          <span>Rule</span>
                                          <strong>{formatted.vsRuleName || detail.rule || "-"}</strong>
                                        </div>
                                        <div className="historyRow">
                                          <span>Stage</span>
                                          <strong>{formatted.stageName || detail.stage || "-"}</strong>
                                        </div>
                                        <div className="historyRow">
                                          <span>Judgement</span>
                                          <strong>{formatted.judgement || detail.result || "-"}</strong>
                                        </div>
                                        <div className="historyRow">
                                          <span>Score</span>
                                          <strong>
                                            {formatted.myScore !== null && formatted.otherScore !== null
                                              ? `${formatted.myScore} - ${formatted.otherScore}`
                                              : "-"}
                                            {formatted.knockout ? " (KO)" : ""}
                                          </strong>
                                        </div>
                                        <div className="historyRow">
                                          <span>Duration</span>
                                          <strong>{formatted.durationSec !== null ? `${formatted.durationSec}s` : "-"}</strong>
                                        </div>
                                        <div className="historyRow">
                                          <span>playedTime</span>
                                          <strong>
                                            {formatted.playedTime ? formatDateTime(formatted.playedTime) : "-"}
                                          </strong>
                                        </div>
                                        <div className="historyRow">
                                          <span>Awards</span>
                                          <strong>{formatted.awards.length ? formatted.awards.join(" / ") : "-"}</strong>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="adminCard" style={{ marginTop: 12 }}>
                                      <h3 className="filterTitle">Players</h3>
                                      <div className="historyTableWrapper adminTableOnly" style={{ marginTop: 8 }}>
                                        <table className="historyTable">
                                          <thead>
                                            <tr>
                                              <th>Team</th>
                                              <th>Player</th>
                                              <th>Weapon</th>
                                              <th>K</th>
                                              <th>D</th>
                                              <th>A</th>
                                              <th>SP</th>
                                              <th>Paint</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {formatted.myPlayers.map((p) => (
                                              <tr
                                                key={`my-${p.key}`}
                                                style={{ background: p.isMyself ? "rgba(0,0,0,0.06)" : undefined }}
                                              >
                                                <td>My</td>
                                                <td>{p.byname ? `${p.name} (${p.byname})` : p.name}</td>
                                                <td>{dashIfEmpty(p.weapon)}</td>
                                                <td>{p.kill ?? "-"}</td>
                                                <td>{p.death ?? "-"}</td>
                                                <td>{p.assist ?? "-"}</td>
                                                <td>{p.special ?? "-"}</td>
                                                <td>{p.paint ?? "-"}</td>
                                              </tr>
                                            ))}
                                            {formatted.otherPlayers.map((p) => (
                                              <tr key={`other-${p.key}`}>
                                                <td>Other</td>
                                                <td>{p.byname ? `${p.name} (${p.byname})` : p.name}</td>
                                                <td>{dashIfEmpty(p.weapon)}</td>
                                                <td>{p.kill ?? "-"}</td>
                                                <td>{p.death ?? "-"}</td>
                                                <td>{p.assist ?? "-"}</td>
                                                <td>{p.special ?? "-"}</td>
                                                <td>{p.paint ?? "-"}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </>
                                )}

                                <div style={{ marginTop: 12 }}>
                                  <details>
                                    <summary style={{ cursor: "pointer" }}>raw JSON を表示</summary>
                                    <pre
                                      style={{
                                        maxHeight: 520,
                                        overflow: "auto",
                                        padding: 12,
                                        background: "rgba(0,0,0,0.04)",
                                        borderRadius: 12,
                                        fontSize: 12,
                                        lineHeight: 1.35,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                      }}
                                    >
                                      {prettyRawJson}
                                    </pre>
                                  </details>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="sectionHeader" style={{ marginTop: 20 }}>
        <h2 className="sectionTitle">Manual sessions (latest 20)</h2>
        <div className="sectionSubtitle">手動入力の不足項目は "-" で表示します</div>
      </div>

      {manualRows.length === 0 ? (
        <div className="emptyState">
          <p>手動入力の記録がありません</p>
        </div>
      ) : (
        <div className="historyTableWrapper">
          <table className="historyTable">
            <thead>
              <tr>
                <th>Played At</th>
                <th>Rule</th>
                <th>Stage1</th>
                <th>Stage2</th>
                <th>Weapon</th>
                <th>W</th>
                <th>L</th>
                <th>Memo</th>
              </tr>
            </thead>
            <tbody>
              {manualRows.map((s) => (
                <tr key={`manual-${s.id}`}>
                  <td className="historyDate">{formatDateTime(s.playedAt)}</td>
                  <td className="textMuted">{dashIfEmpty(s.rule)}</td>
                  <td className="historyStage">{dashIfEmpty(s.stage1)}</td>
                  <td className="historyStage">{dashIfEmpty(s.stage2)}</td>
                  <td className="historyWeapon">{dashIfEmpty(s.weapon)}</td>
                  <td className="historyWins">{Number.isFinite(s.wins) ? s.wins : "-"}</td>
                  <td className="historyLosses">{Number.isFinite(s.losses) ? s.losses : "-"}</td>
                  <td className="historyMemo" title={dashIfEmpty(s.memo ?? "")}>
                    {dashIfEmpty(s.memo ?? "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
