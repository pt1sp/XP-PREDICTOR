import { Fragment, useEffect, useMemo, useState } from "react";
import { STAGES } from "./Constants";
import type { Match, MatchDetail, Rule, Session } from "./api";
import { fetchMatch, fetchMatches } from "./api";

type HistoryViewProps = {
  sessions: Session[];
  onDeleteSession: (sessionId: number) => Promise<void>;
};

type SessionSortKey =
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

type MatchSortKey = "playedAt" | "importedAt" | "rule" | "stage" | "weapon" | "result";

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

function dashIfEmpty(value: string | null | undefined) {
  const s = String(value ?? "").trim();
  return s ? s : "-";
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

function resultClass(result: string | null | undefined) {
  const r = String(result ?? "").toUpperCase();
  if (r.includes("WIN")) return "matchResult matchResultWin";
  if (r.includes("LOSE") || r.includes("LOSS")) return "matchResult matchResultLose";
  return "matchResult matchResultOther";
}

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

function compareSessions(a: Session, b: Session, key: SessionSortKey): number {
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

function parseVsDetail(rawJson: string): unknown | null {
  try {
    const payload: unknown = JSON.parse(rawJson);
    const obj = asObject(payload);
    if (!obj) return payload;

    const data = asObject(obj.data);
    if (data && data.vsHistoryDetail !== undefined) return data.vsHistoryDetail;
    if (obj.vsHistoryDetail !== undefined) return obj.vsHistoryDetail;
    return payload;
  } catch {
    return null;
  }
}

function formatVsDetail(parsedVs: unknown): FormattedMatch | null {
  if (!parsedVs) return null;

  const vsRuleName = readString(getPath(parsedVs, ["vsRule", "name"]));
  const stageName = readString(getPath(parsedVs, ["vsStage", "name"]));
  const playedTime = readString(getPath(parsedVs, ["playedTime"]));
  const durationRaw = getPath(parsedVs, ["duration"]);
  const durationSec = typeof durationRaw === "number" ? durationRaw : null;
  const knockout = Boolean(getPath(parsedVs, ["knockout"]));
  const judgement = readString(getPath(parsedVs, ["judgement"]));

  const myTeam = getPath(parsedVs, ["myTeam"]);
  const otherTeam = asArray(getPath(parsedVs, ["otherTeams"]))[0];

  const teamScore = (t: unknown) => {
    const s = getPath(t, ["result", "score"]);
    return typeof s === "number" ? s : null;
  };

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
        kill: typeof getPath(p, ["result", "kill"]) === "number" ? (getPath(p, ["result", "kill"]) as number) : null,
        death:
          typeof getPath(p, ["result", "death"]) === "number" ? (getPath(p, ["result", "death"]) as number) : null,
        assist:
          typeof getPath(p, ["result", "assist"]) === "number" ? (getPath(p, ["result", "assist"]) as number) : null,
        special:
          typeof getPath(p, ["result", "special"]) === "number" ? (getPath(p, ["result", "special"]) as number) : null,
        paint:
          typeof getPath(p, ["result", "paint"]) === "number" ? (getPath(p, ["result", "paint"]) as number) : null,
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
}

/* ──────────────────────────────────────────────
   Match detail panel (shared between table & card)
   ────────────────────────────────────────────── */

type MatchDetailPanelProps = {
  match: Match;
  detail: MatchDetail | null;
  detailLoading: boolean;
  detailMsg: string;
  formatted: FormattedMatch | null;
  prettyRawJson: string;
};

function MatchDetailPanel({ match: m, detail, detailLoading, detailMsg, formatted, prettyRawJson }: MatchDetailPanelProps) {
  return (
    <div className="adminCard" style={{ margin: 0, borderRadius: 0 }}>
      <h3 className="filterTitle">詳細</h3>
      {detailMsg && <div className="messageBox error">{detailMsg}</div>}
      {detailLoading && (!detail || detail.id !== m.id) ? (
        <div className="emptyState"><p>詳細を読み込み中...</p></div>
      ) : !detail || detail.id !== m.id ? (
        <div className="emptyState"><p>詳細がありません</p></div>
      ) : (
        <>
          <div className="historyCardDetails">
            <div className="historyRow"><span>ID</span><strong>{detail.id}</strong></div>
            <div className="historyRow"><span>External ID</span><strong className="monoText">{detail.externalId}</strong></div>
            <div className="historyRow"><span>Played At</span><strong>{formatDateTime(detail.playedAt)}</strong></div>
            <div className="historyRow"><span>Mode</span><strong>{dashIfEmpty(detail.mode)}</strong></div>
            <div className="historyRow"><span>Rule</span><strong>{dashIfEmpty(detail.rule)}</strong></div>
            <div className="historyRow"><span>Stage</span><strong>{dashIfEmpty(detail.stage)}</strong></div>
            <div className="historyRow"><span>Weapon</span><strong>{dashIfEmpty(detail.weapon)}</strong></div>
            <div className="historyRow"><span>Result</span><strong className={resultClass(detail.result)}>{dashIfEmpty(detail.result)}</strong></div>
            <div className="historyRow"><span>Imported At</span><strong>{detail.importedAt ? formatDateTime(detail.importedAt) : "-"}</strong></div>
          </div>

          {formatted && (
            <>
              <div className="adminCard" style={{ marginTop: 12 }}>
                <h3 className="filterTitle">VS Summary</h3>
                <div className="historyCardDetails">
                  <div className="historyRow"><span>Rule</span><strong>{formatted.vsRuleName || detail.rule || "-"}</strong></div>
                  <div className="historyRow"><span>Stage</span><strong>{formatted.stageName || detail.stage || "-"}</strong></div>
                  <div className="historyRow"><span>Judgement</span><strong>{formatted.judgement || detail.result || "-"}</strong></div>
                  <div className="historyRow">
                    <span>Score</span>
                    <strong>
                      {formatted.myScore !== null && formatted.otherScore !== null
                        ? `${formatted.myScore} - ${formatted.otherScore}`
                        : "-"}
                      {formatted.knockout ? " (KO)" : ""}
                    </strong>
                  </div>
                  <div className="historyRow"><span>Duration</span><strong>{formatted.durationSec !== null ? `${formatted.durationSec}s` : "-"}</strong></div>
                  <div className="historyRow"><span>playedTime</span><strong>{formatted.playedTime ? formatDateTime(formatted.playedTime) : "-"}</strong></div>
                  <div className="historyRow"><span>Awards</span><strong>{formatted.awards.length ? formatted.awards.join(" / ") : "-"}</strong></div>
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
                        <tr key={`my-${p.key}`} style={{ background: p.isMyself ? "rgba(0,0,0,0.06)" : undefined }}>
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
              <pre style={{ maxHeight: 520, overflow: "auto", padding: 12, background: "rgba(0,0,0,0.04)", borderRadius: 12, fontSize: 12, lineHeight: 1.35, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {prettyRawJson}
              </pre>
            </details>
          </div>
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────
   s3s matches section (sub-component)
   ────────────────────────────────────────────── */

function S3sMatchesSection() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [query, setQuery] = useState("");
  const [filterXOnly, setFilterXOnly] = useState(true);
  const [sortKey, setSortKey] = useState<MatchSortKey>("playedAt");
  const [sortDir, setSortDir] = useState<SortOrder>("desc");

  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMsg, setDetailMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const resp = await fetchMatches({ limit, offset });
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
    return () => { cancelled = true; };
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
      return () => { cancelled = true; };
    }
    void loadDetail(selectedMatchId);
    return () => { cancelled = true; };
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

    return filtered.slice().sort((a, b) => {
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
  }, [filterXOnly, matches, query, sortDir, sortKey]);

  const parsedVs = useMemo(() => {
    if (!detail?.rawJson) return null;
    return parseVsDetail(detail.rawJson);
  }, [detail]);

  const formatted = useMemo(() => formatVsDetail(parsedVs), [parsedVs]);

  const prettyRawJson = useMemo(() => {
    if (!detail?.rawJson) return "";
    try {
      return JSON.stringify(JSON.parse(detail.rawJson) as unknown, null, 2);
    } catch {
      return detail.rawJson;
    }
  }, [detail]);

  const hasPrev = offset > 0;
  const hasNext = offset + matches.length < total;

  return (
    <section className="historySection">
      <div className="sectionHeader">
        <h2 className="sectionTitle">SplatNet3 matches (s3s)</h2>
        <div className="sectionSubtitle">s3s で取得した試合結果</div>
      </div>

      {msg && <div className="messageBox error">{msg}</div>}

      <div className="filterSection">
        <div className="filterControls">
          <div className="filterGroup">
            <label className="filterLabel">表示件数</label>
            <select
              className="filterSelect"
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value) || 50); setOffset(0); }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>

          <div className="filterGroup">
            <label className="filterLabel">Range</label>
            <div className="headerBadge">
              {total === 0
                ? "0 / 0"
                : `${Math.min(total, offset + 1)}-${Math.min(total, offset + matches.length)} / ${total}`}
            </div>
          </div>

          <div className="filterGroup">
            <label className="filterLabel">Filtered</label>
            <div className="headerBadge">
              {visibleMatches.length} / {matches.length}
            </div>
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
              onChange={(e) => setSortKey(e.target.value as MatchSortKey)}
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
              <button type="button" className="quickBtn" disabled={!hasPrev || loading} onClick={() => setOffset((v) => Math.max(0, v - limit))}>Prev</button>
              <button type="button" className="quickBtn" disabled={!hasNext || loading} onClick={() => setOffset((v) => v + limit)}>Next</button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="emptyState"><p>読み込み中...</p></div>
      ) : visibleMatches.length === 0 ? (
        <div className="emptyState"><p>matches がありません</p></div>
      ) : (
        <>
          {/* Desktop table (hidden at <=1024px by CSS) */}
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
                        onClick={() => setSelectedMatchId((cur) => (cur === m.id ? null : m.id))}
                        style={{ cursor: "pointer", background: active ? "rgba(0,0,0,0.06)" : undefined }}
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
                            <MatchDetailPanel
                              match={m}
                              detail={detail}
                              detailLoading={detailLoading}
                              detailMsg={detailMsg}
                              formatted={formatted}
                              prettyRawJson={prettyRawJson}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list (shown at <=1024px by CSS) */}
          <div className="historyList">
            {visibleMatches.map((m) => {
              const active = m.id === selectedMatchId;
              return (
                <div key={m.id} className="historyCard">
                  <div
                    className="historyCardSummary"
                    onClick={() => setSelectedMatchId((cur) => (cur === m.id ? null : m.id))}
                  >
                    <span className="historyDate">{formatDateTime(m.playedAt)}</span>
                    <span className={resultClass(m.result)}>{dashIfEmpty(m.result)}</span>
                    <span className="historyWeapon">{dashIfEmpty(m.weapon)}</span>
                  </div>
                  {active && (
                    <MatchDetailPanel
                      match={m}
                      detail={detail}
                      detailLoading={detailLoading}
                      detailMsg={detailMsg}
                      formatted={formatted}
                      prettyRawJson={prettyRawJson}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

/* ──────────────────────────────────────────────
   Main HistoryView
   ────────────────────────────────────────────── */

type HistoryTab = "manual" | "s3s";

export default function HistoryView({ sessions, onDeleteSession }: HistoryViewProps) {
  const [activeTab, setActiveTab] = useState<HistoryTab>("manual");
  const [displayCount, setDisplayCount] = useState(DEFAULT_DISPLAY_COUNT);
  const [sortKey, setSortKey] = useState<SessionSortKey>("playedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [filterWeapon, setFilterWeapon] = useState("");
  const [filterRule, setFilterRule] = useState("");
  const [filterStage, setFilterStage] = useState("");
  const [filterMinWinRate, setFilterMinWinRate] = useState("");
  const [filterMaxWinRate, setFilterMaxWinRate] = useState("");
  const [deletingSessionId, setDeletingSessionId] = useState<number | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);

  const filteredSessions = useMemo(() => {
    const minWinRate = filterMinWinRate === "" ? null : Number(filterMinWinRate);
    const maxWinRate = filterMaxWinRate === "" ? null : Number(filterMaxWinRate);

    return sessions.filter((session) => {
      if (filterWeapon && session.weapon !== filterWeapon) return false;
      if (filterRule && session.rule !== filterRule) return false;
      if (filterStage && session.stage1 !== filterStage && session.stage2 !== filterStage) return false;
      const winRate = toWinRatePercent(session);
      if (minWinRate !== null && winRate < minWinRate) return false;
      if (maxWinRate !== null && winRate > maxWinRate) return false;
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

  const handleSort = (key: SessionSortKey) => {
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
    const weaponSet = new Set(sessions.map((s) => String(s.weapon ?? "").trim()).filter(Boolean));
    return Array.from(weaponSet).sort((a, b) => a.localeCompare(b, "ja"));
  }, [sessions]);

  const getSortIcon = (key: SessionSortKey) => {
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

  return (
    <div className="viewContainer">
      {/* Tab navigation */}
      <div className="historyTabBar">
        <button
          type="button"
          className={`historyTabBtn ${activeTab === "manual" ? "active" : ""}`}
          onClick={() => setActiveTab("manual")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span>手入力の履歴</span>
        </button>
        <button
          type="button"
          className={`historyTabBtn ${activeTab === "s3s" ? "active" : ""}`}
          onClick={() => setActiveTab("s3s")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
          </svg>
          <span>s3s 自動取得</span>
        </button>
      </div>

      {/* s3s matches section */}
      {activeTab === "s3s" && <S3sMatchesSection />}

      {/* manual sessions section */}
      {activeTab === "manual" && (
      <section className="historySection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">手動入力セッション</h2>
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
                  <select className="filterSelect" value={filterWeapon} onChange={(e) => setFilterWeapon(e.target.value)}>
                    <option value="">すべて</option>
                    {allWeapons.map((weapon) => (
                      <option key={weapon} value={weapon}>{weapon}</option>
                    ))}
                  </select>
                </div>

                <div className="filterGroup">
                  <label className="filterLabel">ルール</label>
                  <select className="filterSelect" value={filterRule} onChange={(e) => setFilterRule(e.target.value)}>
                    <option value="">すべて</option>
                    {RULE_OPTIONS.map((rule) => (
                      <option key={rule} value={rule}>{rule}</option>
                    ))}
                  </select>
                </div>

                <div className="filterGroup">
                  <label className="filterLabel">ステージ</label>
                  <select className="filterSelect" value={filterStage} onChange={(e) => setFilterStage(e.target.value)}>
                    <option value="">すべて</option>
                    {STAGES.map((stage) => (
                      <option key={stage} value={stage}>{stage}</option>
                    ))}
                  </select>
                </div>

                <div className="filterGroup">
                  <label className="filterLabel">勝率（最小）</label>
                  <input type="number" className="filterInput" placeholder="0" min="0" max="100" value={filterMinWinRate} onChange={(e) => setFilterMinWinRate(e.target.value)} />
                </div>

                <div className="filterGroup">
                  <label className="filterLabel">勝率（最大）</label>
                  <input type="number" className="filterInput" placeholder="100" min="0" max="100" value={filterMaxWinRate} onChange={(e) => setFilterMaxWinRate(e.target.value)} />
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
                        <th onClick={() => handleSort("playedAt")} className="sortable">日時 {getSortIcon("playedAt")}</th>
                        <th onClick={() => handleSort("weapon")} className="sortable">武器 {getSortIcon("weapon")}</th>
                        <th onClick={() => handleSort("rule")} className="sortable">ルール {getSortIcon("rule")}</th>
                        <th>ステージ1</th>
                        <th>ステージ2</th>
                        <th onClick={() => handleSort("wins")} className="sortable">勝 {getSortIcon("wins")}</th>
                        <th onClick={() => handleSort("losses")} className="sortable">敗 {getSortIcon("losses")}</th>
                        <th onClick={() => handleSort("winRate")} className="sortable">勝率 {getSortIcon("winRate")}</th>
                        <th onClick={() => handleSort("fatigue")} className="sortable">疲労 {getSortIcon("fatigue")}</th>
                        <th onClick={() => handleSort("irritability")} className="sortable">イライラ {getSortIcon("irritability")}</th>
                        <th onClick={() => handleSort("concentration")} className="sortable">集中 {getSortIcon("concentration")}</th>
                        <th onClick={() => handleSort("startXp")} className="sortable">開始XP {getSortIcon("startXp")}</th>
                        <th onClick={() => handleSort("endXp")} className="sortable">終了XP {getSortIcon("endXp")}</th>
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
                            <td className="historyDate">
                              {new Date(s.playedAt).toLocaleString("ja-JP", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="historyWeapon">{dashIfEmpty(s.weapon)}</td>
                            <td className="historyMental">{dashIfEmpty(s.rule)}</td>
                            <td className="historyStage">{dashIfEmpty(s.stage1)}</td>
                            <td className="historyStage">{dashIfEmpty(s.stage2)}</td>
                            <td className="historyWins">{s.wins}</td>
                            <td className="historyLosses">{s.losses}</td>
                            <td className="historyWinRate">{total > 0 ? `${winRate}%` : "-"}</td>
                            <td className="historyMental">{s.fatigue}</td>
                            <td className="historyMental">{s.irritability}</td>
                            <td className="historyMental">{s.concentration}</td>
                            <td className="historyMental">{s.startXp}</td>
                            <td className="historyMental">{s.endXp}</td>
                            <td className="historyMemo" title={s.memo || "-"}>{s.memo || "-"}</td>
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

                {/* Mobile card list (shown at <=1024px by CSS) */}
                <div className="historyList">
                  {displayedSessions.map((s) => {
                    const total = s.wins + s.losses;
                    const winRate = toWinRatePercent(s);
                    const [expanded, setExpanded] = [
                      s.id === expandedSessionId,
                      (v: boolean) => setExpandedSessionId(v ? s.id : null),
                    ] as const;

                    return (
                      <div key={s.id} className="historyCard">
                        <div
                          className="historyCardSummary"
                          onClick={() => setExpanded(!expanded)}
                        >
                          <span className="historyDate">
                            {new Date(s.playedAt).toLocaleString("ja-JP", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="historyWinRate">{total > 0 ? `${winRate}%` : "-"}</span>
                          <span className="historyWeapon">{dashIfEmpty(s.weapon)}</span>
                        </div>
                        {expanded && (
                          <div className="historyCardDetails">
                            <div className="historyRow"><span>ルール</span><strong>{dashIfEmpty(s.rule)}</strong></div>
                            <div className="historyRow"><span>ステージ1</span><strong>{dashIfEmpty(s.stage1)}</strong></div>
                            <div className="historyRow"><span>ステージ2</span><strong>{dashIfEmpty(s.stage2)}</strong></div>
                            <div className="historyRow"><span>勝</span><strong className="historyWins">{s.wins}</strong></div>
                            <div className="historyRow"><span>敗</span><strong className="historyLosses">{s.losses}</strong></div>
                            <div className="historyRow"><span>勝率</span><strong>{total > 0 ? `${winRate}%` : "-"}</strong></div>
                            <div className="historyRow"><span>疲労</span><strong>{s.fatigue}</strong></div>
                            <div className="historyRow"><span>イライラ</span><strong>{s.irritability}</strong></div>
                            <div className="historyRow"><span>集中</span><strong>{s.concentration}</strong></div>
                            <div className="historyRow"><span>開始XP</span><strong>{s.startXp}</strong></div>
                            <div className="historyRow"><span>終了XP</span><strong>{s.endXp}</strong></div>
                            <div className="historyRow"><span>メモ</span><strong>{s.memo || "-"}</strong></div>
                            <button
                              type="button"
                              className="quickBtn historyDeleteBtn"
                              disabled={deletingSessionId === s.id}
                              onClick={(e) => { e.stopPropagation(); void handleDelete(s.id); }}
                            >
                              {deletingSessionId === s.id ? "削除中..." : "削除"}
                            </button>
                          </div>
                        )}
                      </div>
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
      )}
    </div>
  );
}
