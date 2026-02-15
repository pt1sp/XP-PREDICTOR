import { Fragment, useEffect, useMemo, useState } from "react";
import { fetchAdminMatch, fetchAdminMatches, type AdminMatch, type AdminMatchDetail } from "./api";

type MatchesViewProps = {
  onBack: () => void;
};

type SortKey = "playedAt" | "importedAt" | "rule" | "stage" | "weapon" | "result" | "user";

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

export default function MatchesView({ onBack }: MatchesViewProps) {
  const [rows, setRows] = useState<AdminMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AdminMatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMsg, setDetailMsg] = useState("");

  const [query, setQuery] = useState("");
  const [filterRule, setFilterRule] = useState("");
  const [filterResult, setFilterResult] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("playedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const resp = await fetchAdminMatches({ limit, offset });
        if (cancelled) return;
        setRows(resp.rows);
        setTotal(resp.total);
        setMsg("");
      } catch (err) {
        if (cancelled) return;
        setMsg(`matches の取得に失敗: ${String(err)}`);
        setRows([]);
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

  const formatDateTime = (value: string) => new Date(value).toLocaleString("ja-JP");

  useEffect(() => {
    let cancelled = false;
    async function loadDetail(matchId: number) {
      setDetailLoading(true);
      setDetailMsg("");
      try {
        const resp = await fetchAdminMatch(matchId);
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

  const rangeText = useMemo(() => {
    if (total === 0) return "0 / 0";
    const from = Math.min(total, offset + 1);
    const to = Math.min(total, offset + rows.length);
    return `${from}-${to} / ${total}`;
  }, [offset, rows.length, total]);

  const filterOptions = useMemo(() => {
    const uniqSorted = (values: Array<string | null | undefined>) =>
      Array.from(new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "ja-JP")
      );

    const baseRows = rows.filter((r) => isXMatchMode(r.mode));
    return {
      rules: uniqSorted(baseRows.map((r) => r.rule)),
      results: uniqSorted(baseRows.map((r) => r.result)),
      users: uniqSorted(baseRows.map((r) => r.user?.loginId ?? "")),
    };
  }, [rows]);
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

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const containsQuery = (m: AdminMatch) => {
      if (!q) return true;
      const user = m.user?.loginId ?? "";
      const hay = [m.externalId, m.rule, m.stage, m.weapon, m.result, user]
        .map((v) => String(v ?? ""))
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    };

    const filtered = rows.filter((m) => {
      if (!isXMatchMode(m.mode)) return false;
      if (filterRule && (m.rule ?? "") !== filterRule) return false;
      if (filterResult && (m.result ?? "") !== filterResult) return false;
      if (filterUser && (m.user?.loginId ?? "") !== filterUser) return false;
      return containsQuery(m);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const s = (v: unknown) => String(v ?? "");
    const cmpStr = (a: string, b: string) => a.localeCompare(b, "ja-JP") * dir;
    const cmpIso = (a: string, b: string) => a.localeCompare(b) * dir;

    const compare = (a: AdminMatch, b: AdminMatch) => {
      switch (sortKey) {
        case "playedAt":
          return cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        case "importedAt":
          return (
            cmpIso(a.importedAt, b.importedAt) ||
            cmpIso(a.playedAt, b.playedAt) ||
            (a.id - b.id) * dir
          );
        case "rule":
          return cmpStr(s(a.rule), s(b.rule)) || cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        case "stage":
          return cmpStr(s(a.stage), s(b.stage)) || cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        case "weapon":
          return cmpStr(s(a.weapon), s(b.weapon)) || cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        case "result":
          return cmpStr(s(a.result), s(b.result)) || cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        case "user":
          return cmpStr(s(a.user?.loginId), s(b.user?.loginId)) || cmpIso(a.playedAt, b.playedAt) || (a.id - b.id) * dir;
        default:
          return 0;
      }
    };

    return filtered.slice().sort(compare);
  }, [filterResult, filterRule, filterUser, query, rows, sortDir, sortKey]);

  const xRowsCount = useMemo(() => rows.filter((m) => isXMatchMode(m.mode)).length, [rows]);

  const parsedVs = useMemo(() => {
    if (!detail?.rawJson) return null;
    try {
      const payload = JSON.parse(detail.rawJson) as any;
      return (payload?.data?.vsHistoryDetail ?? payload?.vsHistoryDetail ?? payload) as any;
    } catch {
      return null;
    }
  }, [detail]);

  const formatted: FormattedMatch | null = useMemo(() => {
    if (!parsedVs) return null;

    const vsRuleName = String(parsedVs?.vsRule?.name ?? "");
    const stageName = String(parsedVs?.vsStage?.name ?? "");
    const playedTime = String(parsedVs?.playedTime ?? "");
    const durationSec = typeof parsedVs?.duration === "number" ? parsedVs.duration : null;
    const knockout = Boolean(parsedVs?.knockout);
    const judgement = String(parsedVs?.judgement ?? "");

    const myTeam = parsedVs?.myTeam ?? null;
    const otherTeam = Array.isArray(parsedVs?.otherTeams) ? parsedVs.otherTeams[0] : null;

    const teamScore = (t: any) => {
      const s = t?.result?.score;
      return typeof s === "number" ? s : null;
    };

    const myScore = teamScore(myTeam);
    const otherScore = teamScore(otherTeam);

    const awards = Array.isArray(parsedVs?.awards)
      ? parsedVs.awards
          .map((a: any) => String(a?.name ?? "").trim())
          .filter(Boolean)
      : [];

    const mapPlayers = (t: any): FormattedPlayer[] => {
      const ps = Array.isArray(t?.players) ? t.players : [];
      return ps.map((p: any) => {
        const weapon = String(p?.weapon?.name ?? "").trim();
        const name = String(p?.name ?? "").trim();
        const byname = String(p?.byname ?? "").trim();
        const isMyself = Boolean(p?.isMyself);
        const r = p?.result ?? {};
        return {
          key: String(p?.id ?? `${name}-${weapon}`),
          name,
          byname,
          weapon,
          isMyself,
          kill: typeof r.kill === "number" ? r.kill : null,
          death: typeof r.death === "number" ? r.death : null,
          assist: typeof r.assist === "number" ? r.assist : null,
          special: typeof r.special === "number" ? r.special : null,
          paint: typeof r.paint === "number" ? r.paint : null,
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
  const hasNext = offset + rows.length < total;

  const activeDetail =
    selectedMatchId !== null && detail && detail.id === selectedMatchId ? detail : null;

  const resultClass = (result: string | null | undefined) => {
    const r = String(result ?? "").toUpperCase();
    if (r.includes("WIN")) return "matchResult matchResultWin";
    if (r.includes("LOSE") || r.includes("LOSS")) return "matchResult matchResultLose";
    return "matchResult matchResultOther";
  };

  return (
    <div className="viewContainer adminViewContainer matchesViewContainer">
      <section className="historySection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">matches</h2>
          <div className="sectionSubtitle">SplatNet3 results (raw JSON stored in DB)</div>
        </div>

        {msg && <div className="messageBox error">{msg}</div>}

        <div className="filterSection">
          <div className="filterControls">
            <div className="filterGroup">
              <label className="filterLabel">Navigation</label>
              <button type="button" className="quickBtn" onClick={onBack}>
                管理に戻る
              </button>
            </div>
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
              <label className="filterLabel">Range</label>
              <div className="headerBadge">{rangeText}</div>
            </div>
            <div className="filterGroup">
              <label className="filterLabel">Filtered</label>
              <div className="headerBadge">
                {visibleRows.length} / {xRowsCount}
              </div>
            </div>
            <div className="filterGroup">
              <label className="filterLabel">Search</label>
              <input
                className="filterInput"
                value={query}
                placeholder="rule / stage / weapon / user / externalId"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="filterGroup">
              <label className="filterLabel">Rule</label>
              <select className="filterSelect" value={filterRule} onChange={(e) => setFilterRule(e.target.value)}>
                <option value="">All</option>
                {filterOptions.rules.map((v) => (
                  <option key={`rule-${v}`} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="filterGroup">
              <label className="filterLabel">Result</label>
              <select className="filterSelect" value={filterResult} onChange={(e) => setFilterResult(e.target.value)}>
                <option value="">All</option>
                {filterOptions.results.map((v) => (
                  <option key={`result-${v}`} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="filterGroup">
              <label className="filterLabel">User</label>
              <select className="filterSelect" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
                <option value="">All</option>
                {filterOptions.users.map((v) => (
                  <option key={`user-${v}`} value={v}>
                    {v}
                  </option>
                ))}
              </select>
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
                <option value="user">User</option>
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
        ) : visibleRows.length === 0 ? (
          <div className="emptyState">
            <p>matches がありません</p>
          </div>
        ) : (
          <>
            <div className="historyTableWrapper adminTableOnly">
              <table className="historyTable">
                <thead>
                  <tr>
                    <th>Played At</th>
                    <th>Rule</th>
                  <th>Stage</th>
                  <th>Weapon</th>
                  <th>Result</th>
                  <th>User</th>
                  <th>Imported At</th>
                </tr>
              </thead>
                <tbody>
                  {visibleRows.map((m) => {
                    const active = m.id === selectedMatchId;
                    return (
                      <Fragment key={m.id}>
                        <tr
                          key={m.id}
                          onClick={() =>
                            setSelectedMatchId((current) => (current === m.id ? null : m.id))
                          }
                          style={{
                            cursor: "pointer",
                            background: active ? "rgba(0,0,0,0.06)" : undefined,
                          }}
                          title="クリックで詳細表示"
                        >
                          <td className="historyDate">{formatDateTime(m.playedAt)}</td>
                          <td className="textMuted">{m.rule || "-"}</td>
                          <td className="historyStage">{m.stage || "-"}</td>
                          <td className="historyWeapon">{m.weapon || "-"}</td>
                          <td className={resultClass(m.result)}>{m.result || "-"}</td>
                          <td className="textMuted">{m.user?.loginId ?? "-"}</td>
                          <td className="textMuted">{m.importedAt ? formatDateTime(m.importedAt) : "-"}</td>
                        </tr>
                      {active && (
                        <tr key={`detail-${m.id}`}>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <div className="adminCard" style={{ margin: 0, borderRadius: 0 }}>
                              <h3 className="filterTitle">詳細</h3>
                              {detailMsg && <div className="messageBox error">{detailMsg}</div>}
                                {detailLoading && !activeDetail ? (
                                  <div className="emptyState">
                                    <p>詳細を読み込み中...</p>
                                  </div>
                                ) : !activeDetail ? (
                                  <div className="emptyState">
                                    <p>詳細がありません</p>
                                  </div>
                                ) : (
                                  <>
                                    <div className="historyCardDetails">
                                      <div className="historyRow">
                                        <span>ID</span>
                                        <strong>{activeDetail.id}</strong>
                                      </div>
                                      <div className="historyRow">
                                        <span>Played At</span>
                                        <strong>{formatDateTime(activeDetail.playedAt)}</strong>
                                      </div>
                                      <div className="historyRow">
                                        <span>Rule</span>
                                        <strong>{activeDetail.rule || "-"}</strong>
                                      </div>
                                      <div className="historyRow">
                                        <span>Stage</span>
                                        <strong>{activeDetail.stage || "-"}</strong>
                                      </div>
                                      <div className="historyRow">
                                        <span>Weapon</span>
                                        <strong>{activeDetail.weapon || "-"}</strong>
                                      </div>
                                      <div className="historyRow">
                                        <span>Result</span>
                                        <strong>{activeDetail.result || "-"}</strong>
                                      </div>
                                      <div className="historyRow">
                                        <span>External ID</span>
                                        <strong
                                          style={{
                                            fontFamily:
                                              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                                          }}
                                        >
                                          {activeDetail.externalId}
                                        </strong>
                                      </div>
                                          <div className="historyRow">
                                            <span>Imported At</span>
                                            <strong>{formatDateTime(activeDetail.importedAt)}</strong>
                                          </div>
                                          <div className="historyRow">
                                            <span>User</span>
                                            <strong>{activeDetail.user?.loginId ?? "-"}</strong>
                                          </div>
                                        </div>

                                    {formatted && (
                                      <>
                                        <div className="adminCard" style={{ marginTop: 12 }}>
                                          <h3 className="filterTitle">VS Summary</h3>
                                          <div className="historyCardDetails">
                                            <div className="historyRow">
                                              <span>Rule</span>
                                              <strong>{formatted.vsRuleName || activeDetail.rule || "-"}</strong>
                                            </div>
                                            <div className="historyRow">
                                              <span>Stage</span>
                                              <strong>{formatted.stageName || activeDetail.stage || "-"}</strong>
                                            </div>
                                            <div className="historyRow">
                                              <span>Judgement</span>
                                              <strong>{formatted.judgement || activeDetail.result || "-"}</strong>
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
                                              <strong>
                                                {formatted.durationSec !== null ? `${formatted.durationSec}s` : "-"}
                                              </strong>
                                            </div>
                                            <div className="historyRow">
                                              <span>playedTime</span>
                                              <strong>{formatted.playedTime ? formatDateTime(formatted.playedTime) : "-"}</strong>
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
                                                  <tr key={`my-${p.key}`} style={{ background: p.isMyself ? "rgba(0,0,0,0.06)" : undefined }}>
                                                    <td>My</td>
                                                    <td>{p.byname ? `${p.name} (${p.byname})` : p.name}</td>
                                                    <td>{p.weapon || "-"}</td>
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
                                                    <td>{p.weapon || "-"}</td>
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

            <div className="adminSessionList adminMobileOnly">
              {visibleRows.map((m) => (
                <details key={`match-${m.id}`} className="historyCard">
                  <summary className="historyCardSummary">
                    <span className="historyDate">{formatDateTime(m.playedAt)}</span>
                    <span className={resultClass(m.result)}>{m.result || "-"}</span>
                    <span className="historyWeapon">{m.weapon || "-"}</span>
                    <span className="historyStage">{m.stage || "-"}</span>
                  </summary>
                  <div className="historyCardDetails">
                    <div className="historyRow">
                      <span>Played At</span>
                      <strong>{formatDateTime(m.playedAt)}</strong>
                    </div>
                    <div className="historyRow">
                      <span>Rule</span>
                      <strong>{m.rule || "-"}</strong>
                    </div>
                    <div className="historyRow">
                      <span>Stage</span>
                      <strong>{m.stage || "-"}</strong>
                    </div>
                    <div className="historyRow">
                      <span>Weapon</span>
                      <strong>{m.weapon || "-"}</strong>
                    </div>
                    <div className="historyRow">
                      <span>Result</span>
                      <strong className={resultClass(m.result)}>{m.result || "-"}</strong>
                    </div>
                    <div className="historyRow">
                      <span>User</span>
                      <strong>{m.user?.loginId ?? "-"}</strong>
                    </div>
                    <div className="historyRow">
                      <span>Imported At</span>
                      <strong>{m.importedAt ? formatDateTime(m.importedAt) : "-"}</strong>
                    </div>
                    <div className="historyRow">
                      <span>External ID</span>
                      <strong className="monoText">{m.externalId}</strong>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
