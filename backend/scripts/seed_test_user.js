const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Database = require("better-sqlite3");

const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "dev.db");
const CONSTANTS_PATH = path.join(ROOT, "..", "frontend", "src", "Constants.ts");

const TOTAL_ROWS = 300;
const DAYS = 90;
const RULE = "エリア";
const LOGIN_ID = "test";
const PASSWORD = "testpass123";

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sampleOneWeighted(items) {
  const sum = items.reduce((a, i) => a + i.weight, 0);
  let r = Math.random() * sum;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item.value;
  }
  return items[items.length - 1].value;
}

function sampleWithoutReplacementWeighted(items, count) {
  const pool = [...items];
  const result = [];
  while (result.length < count && pool.length > 0) {
    const picked = sampleOneWeighted(pool.map((p) => ({ value: p, weight: p.weight })));
    result.push(picked.value);
    const idx = pool.findIndex((p) => p.value.getTime() === picked.value.getTime());
    pool.splice(idx, 1);
  }
  return result;
}

function normal(mean = 0, sd = 1) {
  const u1 = Math.max(1e-12, Math.random());
  const u2 = Math.max(1e-12, Math.random());
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}

function extractQuotedArrayBlock(source, blockName) {
  const m = source.match(new RegExp(`export const ${blockName} = \\[(.*?)\\] as const;`, "s"));
  if (!m) return [];
  const out = [];
  const re = /"([^"]+)"/g;
  let mm;
  while ((mm = re.exec(m[1])) !== null) out.push(mm[1]);
  return out;
}

function extractAllWeapons(source) {
  const out = [];
  const weaponArrayRe = /weapons:\s*\[(.*?)\]/gs;
  let m;
  while ((m = weaponArrayRe.exec(source)) !== null) {
    const re = /"([^"]+)"/g;
    let mm;
    while ((mm = re.exec(m[1])) !== null) out.push(mm[1]);
  }
  return [...new Set(out)];
}

function xpGainLoss(startXp) {
  if (startXp >= 3500) return { win: 8, loss: 18 };
  if (startXp >= 3300) return { win: 9, loss: 17 };
  if (startXp >= 3100) return { win: 10, loss: 16 };
  if (startXp >= 3000) return { win: 11, loss: 15 };
  if (startXp >= 2800) return { win: 12, loss: 14 };
  if (startXp >= 2600) return { win: 13, loss: 13 };
  if (startXp >= 2400) return { win: 14, loss: 12 };
  return { win: 15, loss: 11 };
}

function xpPressure(startXp) {
  if (startXp >= 3600) return 0.05;
  if (startXp >= 3400) return 0.04;
  if (startXp >= 3200) return 0.025;
  if (startXp >= 3000) return 0.015;
  if (startXp < 2600) return -0.01;
  return 0;
}

function timeBias(d) {
  const h = d.getHours();
  const wd = d.getDay(); // 0=Sun
  let b = 0;
  if (h >= 20) b += 0.03;
  else if (h <= 2) b -= 0.02;
  else if (h >= 8 && h <= 11) b -= 0.01;
  if (wd === 0 || wd === 6) b += 0.02;
  if (wd >= 1 && wd <= 4) b -= 0.005;
  if (wd === 5 && h >= 20) b += 0.015;
  return clamp(b, -0.05, 0.07);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function slotWeight(d) {
  const h = d.getHours();
  const wd = d.getDay();
  let w = 1.0;
  if (h >= 20) w *= 2.0;
  else if (h >= 18) w *= 1.6;
  else if (h <= 2) w *= 0.8;
  if (wd === 0 || wd === 6) w *= 1.2;
  return w;
}

function buildWeaponWeights(availableWeapons) {
  // 参考: https://risyu.org/ranking/ranking-test/ のXマッチ武器使用率（上位）
  const source = [
    ["スプラシューター", 5.57],
    [".52ガロン", 4.46],
    ["わかばシューター", 3.09],
    ["スプラローラー", 2.76],
    ["スプラシューターコラボ", 2.74],
    ["もみじシューター", 2.35],
    ["ボールドマーカー", 2.17],
    ["N-ZAP85", 1.98],
    ["デュアルスイーパー", 1.97],
    ["カーボンローラーデコ", 1.92],
    ["スパッタリー・ヒュー", 1.82],
    ["クアッドホッパーブラック", 1.78],
    ["ハイドラント", 1.76],
    ["リッター4K", 1.75],
    ["オーダーシューター レプリカ", 1.73],
    ["スプラマニューバーコラボ", 1.71],
    ["プライムシューターコラボ", 1.68],
    ["ホットブラスターカスタム", 1.64],
    ["パブロ", 1.54],
    ["ロングブラスター", 1.45],
    ["オーバーフロッシャー", 1.44],
    ["デンタルワイパーミント", 1.36],
    ["ノーチラス47", 1.24],
    ["イグザミナー", 1.23],
    ["ヒッセン・ヒュー", 1.18],
    ["ノーチラス79", 1.15],
    ["ダイナモローラー", 1.14],
    ["トライストリンガー", 1.12],
    ["シャープマーカー", 1.11],
    ["シャープマーカーネオ", 1.07],
  ];

  const matched = source
    .filter(([name]) => availableWeapons.includes(name))
    .map(([name, p], idx) => ({
      name,
      baseWeight: p,
      rankBoost: 0.25 * (1 - idx / Math.max(1, source.length - 1)),
    }));

  if (matched.length < 10) {
    const fallback = availableWeapons.slice(0, 25).map((name, idx) => ({
      name,
      baseWeight: 1 + (25 - idx) * 0.03,
      rankBoost: 0,
    }));
    return fallback;
  }
  return matched;
}

function main() {
  const constants = fs.readFileSync(CONSTANTS_PATH, "utf8");
  const stages = extractQuotedArrayBlock(constants, "STAGES");
  const allWeapons = extractAllWeapons(constants);
  if (stages.length < 2) throw new Error("Failed to read stages from Constants.ts");
  if (allWeapons.length < 10) throw new Error("Failed to read weapons from Constants.ts");

  const weaponRows = buildWeaponWeights(allWeapons);
  const weaponWeights = weaponRows.map((w) => ({ value: w.name, weight: w.baseWeight }));
  const topWeapons = weaponRows.slice(0, Math.min(12, weaponRows.length)).map((w) => w.name);
  const prefWeapons = new Set(topWeapons.slice(0, 3));
  const weakWeapons = new Set(topWeapons.slice(8, 11));

  const stageBias = new Map(stages.map((s) => [s, normal(0, 0.015)]));
  for (let i = 0; i < Math.min(3, stages.length); i += 1) {
    stageBias.set(stages[i], (stageBias.get(stages[i]) || 0) + 0.02);
  }
  for (let i = 0; i < Math.min(3, stages.length); i += 1) {
    const key = stages[stages.length - 1 - i];
    stageBias.set(key, (stageBias.get(key) || 0) - 0.02);
  }

  const now = new Date();
  now.setMinutes(0, 0, 0);
  const start = new Date(now);
  start.setDate(start.getDate() - DAYS + 1);
  start.setHours(0, 0, 0, 0);

  const slots = [];
  for (let d = 0; d < DAYS; d += 1) {
    for (let h = 0; h < 24; h += 2) {
      const t = new Date(start);
      t.setDate(start.getDate() + d);
      t.setHours(h, 0, 0, 0);
      if (t <= now) slots.push({ value: t, weight: slotWeight(t) });
    }
  }
  if (slots.length < TOTAL_ROWS) throw new Error("Not enough time slots to generate rows");

  const pickedSlots = sampleWithoutReplacementWeighted(slots, TOTAL_ROWS).sort(
    (a, b) => a.getTime() - b.getTime()
  );

  let currentXp = randInt(2950, 3250);
  const rows = [];

  for (const playedAt of pickedSlots) {
    const weapon = sampleOneWeighted(weaponWeights);
    const stage1 = stages[randInt(0, stages.length - 1)];
    let stage2 = stages[randInt(0, stages.length - 1)];
    while (stage2 === stage1) stage2 = stages[randInt(0, stages.length - 1)];

    const matches = randInt(10, 30);
    const fatigue = clamp(Math.round(normal(3 + (matches - 20) / 30 + (playedAt.getHours() >= 20 ? 0.3 : 0), 1)), 1, 5);
    const irritability = clamp(Math.round(normal(2.8 + (fatigue - 3) * 0.45, 1.05)), 1, 5);
    const concentration = clamp(Math.round(normal(3.2 - (fatigue - 3) * 0.4, 1.0)), 1, 5);

    const weaponSkill =
      (prefWeapons.has(weapon) ? 0.04 : 0) +
      (weakWeapons.has(weapon) ? -0.04 : 0) +
      normal(0, 0.01);
    const stageSkill = ((stageBias.get(stage1) || 0) + (stageBias.get(stage2) || 0)) / 2;

    const p = clamp(
      0.52 +
        weaponSkill +
        stageSkill * 0.55 +
        timeBias(playedAt) +
        (concentration - 3) * 0.015 -
        (fatigue - 3) * 0.02 -
        (irritability - 3) * 0.018 -
        xpPressure(currentXp) +
        normal(0, 0.03),
      0.3,
      0.8
    );

    let wins = 0;
    for (let i = 0; i < matches; i += 1) {
      if (Math.random() < p) wins += 1;
    }
    const losses = matches - wins;

    const gainLoss = xpGainLoss(currentXp);
    let xpDelta = wins * gainLoss.win - losses * gainLoss.loss + Math.round(normal(0, 16));

    if (currentXp >= 3000 && Math.random() < 0.12) {
      const outlier = Math.random() < 0.65 ? -randInt(80, 200) : randInt(60, 130);
      xpDelta += outlier;
      xpDelta = clamp(xpDelta, -200, 130);
    } else if (currentXp < 3000 && Math.random() < 0.08) {
      xpDelta += Math.random() < 0.6 ? -randInt(70, 180) : randInt(50, 150);
    }

    const startXp = currentXp;
    const endXp = clamp(startXp + xpDelta, 2000, 4400);
    currentXp = endXp;

    rows.push({
      playedAt: playedAt.toISOString(),
      rule: RULE,
      stage1,
      stage2,
      weapon,
      wins,
      losses,
      fatigue,
      irritability,
      concentration,
      startXp,
      endXp,
      memo: null,
    });
  }

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");
  const passwordHash = hashPassword(PASSWORD);

  const run = db.transaction(() => {
    const existing = db
      .prepare(`SELECT id FROM users WHERE login_id = ?`)
      .get(LOGIN_ID);

    if (existing?.id) {
      db.prepare(`DELETE FROM "Session" WHERE userId = ?`).run(existing.id);
      db.prepare(`DELETE FROM auth_tokens WHERE user_id = ?`).run(existing.id);
      db.prepare(`DELETE FROM users WHERE id = ?`).run(existing.id);
    }

    const insUser = db
      .prepare(`INSERT INTO users (login_id, password_hash, role) VALUES (?, ?, 'ADMIN')`)
      .run(LOGIN_ID, passwordHash);
    const userId = Number(insUser.lastInsertRowid);

    const ins = db.prepare(`
      INSERT INTO "Session" (
        "userId", "playedAt", "rule", "stage1", "stage2", "weapon",
        "wins", "losses", "fatigue", "irritability", "concentration",
        "startXp", "endXp", "memo"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const r of rows) {
      ins.run(
        userId,
        r.playedAt,
        r.rule,
        r.stage1,
        r.stage2,
        r.weapon,
        r.wins,
        r.losses,
        r.fatigue,
        r.irritability,
        r.concentration,
        r.startXp,
        r.endXp,
        r.memo
      );
    }

    return userId;
  });

  const userId = run();
  const stats = db
    .prepare(
      `SELECT COUNT(*) as cnt, AVG(wins + losses) as avg_games, MIN(startXp) as min_xp, MAX(startXp) as max_xp
       FROM "Session" WHERE userId = ?`
    )
    .get(userId);
  const xpDeltaStats = db
    .prepare(
      `SELECT AVG(endXp - startXp) as avg_delta, MIN(endXp - startXp) as min_delta, MAX(endXp - startXp) as max_delta
       FROM "Session" WHERE userId = ?`
    )
    .get(userId);

  console.log(
    JSON.stringify(
      {
        userId,
        loginId: LOGIN_ID,
        role: "ADMIN",
        inserted: stats.cnt,
        avgGames: Number(stats.avg_games.toFixed(2)),
        startXpRange: [stats.min_xp, stats.max_xp],
        xpDelta: {
          avg: Number(xpDeltaStats.avg_delta.toFixed(2)),
          min: xpDeltaStats.min_delta,
          max: xpDeltaStats.max_delta,
        },
      },
      null,
      2
    )
  );
}

main();
