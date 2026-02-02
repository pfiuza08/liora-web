// ==========================================================
// 📊 LIORA — DASHBOARD (MVP Local)
// - Salva tentativas (simulados) em localStorage
// - Calcula KPIs e insights
// - Bloqueia cards PREMIUM no modo free
// ==========================================================

const LS_KEY = "lioraMetrics:v1";

function qs(id) {
  return document.getElementById(id);
}

function pct(n) {
  return `${Math.round(n * 100)}%`;
}

function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || { attempts: [] };
  } catch {
    return { attempts: [] };
  }
}

function saveStore(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

// attempt schema:
// {
//   ts: number,
//   date: "yyyy-mm-dd",
//   banca: string,
//   tema: string,
//   dificuldade: string,
//   total: number,
//   correct: number,
//   timeSec: number,
//   mode: "obj" | "disc"

// }
function recordAttempt(attempt) {
  // ✅ trava: não salva tentativa sem questões pontuadas (evita poluir com discursivas/vazio)
  const total = Number(attempt?.total || 0);
  if (total <= 0) return;

  const data = loadStore();

  data.attempts.push({
    ts: Date.now(),
    date: todayISO(),
    banca: attempt?.banca || "—",
    tema: (attempt?.tema || "").trim() || "Geral",
    dificuldade: attempt?.dificuldade || "misturado",
    total,
    correct: Number(attempt?.correct || 0),
    timeSec: Number(attempt?.timeSec || 0),

    // ✅ novo: modo do simulado (compatível com histórico antigo)
    mode: String(attempt?.mode || "obj").toLowerCase() === "disc" ? "disc" : "obj",
  });

  // cap de histórico (evitar localStorage gigante)
  if (data.attempts.length > 500) data.attempts = data.attempts.slice(-500);

  saveStore(data);
}


function computeStats(attempts) {
  const totalAttempts = attempts.length;
  const totalQ = attempts.reduce((s, a) => s + (a.total || 0), 0);
  const totalC = attempts.reduce((s, a) => s + (a.correct || 0), 0);
  const totalTime = attempts.reduce((s, a) => s + (a.timeSec || 0), 0);

  const acc = totalQ ? totalC / totalQ : 0;
  const avgSec = totalQ ? totalTime / totalQ : 0;

  // streak (sequência de dias com pelo menos 1 simulado)
  const days = new Set(attempts.map((a) => a.date).filter(Boolean));
  const dayList = Array.from(days).sort(); // yyyy-mm-dd ordena ok
  let streak = 0;
  if (dayList.length) {
    const set = new Set(dayList);
    let d = new Date(dayList[dayList.length - 1] + "T00:00:00");
    while (true) {
      const key = todayISO(d);
      if (!set.has(key)) break;
      streak++;
      d.setDate(d.getDate() - 1);
    }
  }

  const byKey = (keyFn) => {
    const m = new Map();
    for (const a of attempts) {
      const k = keyFn(a);
      const cur = m.get(k) || { total: 0, correct: 0, timeSec: 0, attempts: 0 };
      cur.total += a.total || 0;
      cur.correct += a.correct || 0;
      cur.timeSec += a.timeSec || 0;
      cur.attempts += 1;
      m.set(k, cur);
    }
    return m;
  };

  const byBanca = byKey((a) => a.banca || "—");
  const byTema = byKey((a) => a.tema || "Geral");
  const byDif = byKey((a) => a.dificuldade || "misturado");

  function windowStats(daysBack) {
    const cutoff = Date.now() - daysBack * 24 * 3600 * 1000;
    const w = attempts.filter((a) => (a.ts || 0) >= cutoff);
    const q = w.reduce((s, a) => s + (a.total || 0), 0);
    const c = w.reduce((s, a) => s + (a.correct || 0), 0);
    return { attempts: w.length, q, c, acc: q ? c / q : 0 };
  }

  const w7 = windowStats(7);
  const w30 = windowStats(30);

  // pontos fracos: temas com >= 15 questões e acerto < 65%
  const weaknesses = Array.from(byTema.entries())
    .map(([tema, v]) => ({
      tema,
      total: v.total,
      acc: v.total ? v.correct / v.total : 0,
    }))
    .filter((x) => x.total >= 15)
    .sort((a, b) => a.acc - b.acc)
    .slice(0, 5);

  return {
    totalAttempts,
    totalQ,
    totalC,
    totalTime,
    acc,
    avgSec,
    streak,
    byBanca,
    byTema,
    byDif,
    w7,
    w30,
    weaknesses,
  };
}

function cardKPI({ title, value, sub = "", tone = "" }) {
  return `
    <div class="dash-card ${tone}">
      <div class="dash-title">${title}</div>
      <div class="dash-value">${value}</div>
      ${sub ? `<div class="dash-sub muted">${sub}</div>` : ""}
    </div>
  `;
}

function cardLocked({ title, teaser = "Disponível no plano Premium" }) {
  return `
    <div class="dash-card dash-locked">
      <div class="dash-lock">🔒 Premium</div>
      <div class="dash-title">${title}</div>
      <div class="dash-sub muted">${teaser}</div>
    </div>
  `;
}

function miniTable(title, rows) {
  const body = rows?.length
    ? rows
        .map(
          (r) => `
          <div class="dash-row">
            <div class="dash-row-left">
              <div class="dash-row-title">${r.name}</div>
              <div class="dash-row-sub muted">${r.sub || ""}</div>
            </div>
            <div class="dash-row-right">
              <div class="dash-row-metric">${r.metric}</div>
            </div>
          </div>
        `
        )
        .join("")
    : `<div class="muted">Sem dados suficientes.</div>`;

  return `
    <div class="dash-card">
      <div class="dash-title">${title}</div>
      <div class="dash-list">${body}</div>
    </div>
  `;
}

function topN(map, n = 5) {
  return Array.from(map.entries())
    .map(([name, v]) => ({
      name,
      total: v.total,
      acc: v.total ? v.correct / v.total : 0,
      attempts: v.attempts,
      avgSec: v.total ? v.timeSec / v.total : 0,
    }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

function renderDashboard({ isPremium = false } = {}) {
  const attempts = loadStore().attempts || [];

  const empty = qs("dash-empty"); // opcional
  const kpis = qs("dash-kpis");
  const insights = qs("dash-insights");
  const tables = qs("dash-tables");

  if (!kpis || !insights || !tables) return;

  if (!attempts.length) {
    if (empty) empty.classList.remove("hidden");
    kpis.innerHTML = "";
    insights.innerHTML = "";
    tables.innerHTML = "";
    return;
  } else {
    if (empty) empty.classList.add("hidden");
  }

  const s = computeStats(attempts);

  // helpers locais
  const fmtLast = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${mi}`;
  };

  const getMode = (a) => (String(a?.mode || "obj").toLowerCase() === "disc" ? "disc" : "obj");
  const objCount = attempts.filter((a) => getMode(a) === "obj").length;
  const discCount = attempts.filter((a) => getMode(a) === "disc").length;

  const last = attempts[attempts.length - 1];

 
    // KPIs (FREE) — layout 3 colunas (desktop) preenchido (3×2)
  kpis.innerHTML = [
    // Linha 1
    cardKPI({
      title: "Acerto geral",
      value: s.totalQ ? pct(s.acc) : "—",
      sub: `${s.totalC}/${s.totalQ} questões`,
      tone: s.acc >= 0.75 ? "good" : s.acc >= 0.6 ? "ok" : "warn",
    }),
    cardKPI({ title: "Questões", value: String(s.totalQ), sub: "Respondidas" }),
    cardKPI({ title: "Simulados", value: String(s.totalAttempts), sub: "Total feitos" }),
  
    // Linha 2
    cardKPI({
      title: "Tempo / questão",
      value: s.totalQ ? `${Math.round(s.avgSec)}s` : "—",
      sub: "Média geral",
    }),
    cardKPI({ title: "Streak", value: `${s.streak} dia(s)`, sub: "Sequência ativa" }),
    cardKPI({
      title: "Último simulado",
      value: fmtLast(last?.ts),
      sub: `${(last?.banca || "—")} · ${(last?.tema || "Geral")}`,
    }),
  
    // Linha 3 (compacta): Tipos como mini-card, mas ainda em 3 colunas
    (() => {
    const html = cardKPI({
      title: "Tipos",
      value: `${objCount} OBJ`,
      sub: `${discCount} DISC`,
    });
    return html.replace('class="dash-card', 'class="dash-card dash-kpi-types');
  })(),
    // dois "spacers" invisíveis para fechar 3 colunas sem buracos feios
    `<div class="dash-spacer"></div>`,
    `<div class="dash-spacer"></div>`,
  ].join("");

  // ✅ novo (FREE): foco atual (tema mais praticado)
  const topTema = topN(s.byTema, 1)[0];
  const focoAtualCard = cardKPI({
    title: "Foco atual",
    value: topTema?.name || "—",
    sub: topTema ? `${topTema.total} questões` : "Sem dados",
    tone: "ok",
  });

  // INSIGHTS
  const w7txt = s.w7.q ? `${pct(s.w7.acc)} em ${s.w7.q} questões` : "Sem dados";
  const w30txt = s.w30.q ? `${pct(s.w30.acc)} em ${s.w30.q} questões` : "Sem dados";

  insights.innerHTML = [
    focoAtualCard, // ✅ livre

    isPremium
      ? cardKPI({ title: "Últimos 7 dias", value: w7txt, sub: `Simulados: ${s.w7.attempts}` })
      : cardLocked({ title: "Últimos 7 dias", teaser: "Evolução semanal (acertos e volume)" }),

    isPremium
      ? cardKPI({ title: "Últimos 30 dias", value: w30txt, sub: `Simulados: ${s.w30.attempts}` })
      : cardLocked({ title: "Últimos 30 dias", teaser: "Evolução mensal e tendência" }),

    isPremium
      ? (function () {
          const weak = s.weaknesses[0];
          return weak
            ? cardKPI({
                title: "Ponto fraco #1",
                value: weak.tema,
                sub: `${pct(weak.acc)} em ${weak.total} questões`,
                tone: "warn",
              })
            : cardKPI({ title: "Pontos fracos", value: "—", sub: "Ainda não há dados" });
        })()
      : cardLocked({ title: "Pontos fracos", teaser: "Top temas com menor acerto" }),

    isPremium
      ? cardKPI({
          title: "Recomendação",
          value: "Próximo passo",
          sub: s.weaknesses.length
            ? `Revisar "${s.weaknesses[0].tema}" e fazer 10 questões`
            : "Faça mais 1 simulado para gerar recomendações",
        })
      : cardLocked({ title: "Recomendação", teaser: "Ações automáticas para subir seu acerto" }),
  ].join("");

  // Tabelas
  const bancaTop = topN(s.byBanca, 5).map((x) => ({
    name: x.name,
    sub: `${x.total} questões`,
    metric: pct(x.acc),
  }));

  const temaTop = topN(s.byTema, 5).map((x) => ({
    name: x.name,
    sub: `${x.total} questões`,
    metric: pct(x.acc),
  }));

  const difTop = topN(s.byDif, 5).map((x) => ({
    name: x.name,
    sub: `${x.total} questões • ${Math.round(x.avgSec)}s/q`,
    metric: pct(x.acc),
  }));

  tables.innerHTML = [
    isPremium
      ? miniTable("Por banca (top 5)", bancaTop)
      : cardLocked({ title: "Por banca", teaser: "Acerto e volume por banca" }),
    isPremium
      ? miniTable("Por tema (top 5)", temaTop)
      : cardLocked({ title: "Por tema", teaser: "Acerto e volume por tema" }),
    miniTable("Por dificuldade", difTop),
  ].join("");
}

function isUserPremium() {
  // MVP: tudo free.
  // Depois você troca pelo seu gate real (auth/assinatura).
  return false;
}

// ==========================================================
// EXPORT
// ==========================================================
export const dashboard = {
  ctx: null,

  showScreen() {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById("screen-dashboard")?.classList.add("active");
  },

  init(ctx) {
    this.ctx = ctx;

    if (window.__lioraDashboardInited) return;
    window.__lioraDashboardInited = true;

    // ✅ EXPÕE API GLOBAL DO MVP (isso estava faltando)
    window.lioraMetrics = window.lioraMetrics || {};
    window.lioraMetrics.recordAttempt = recordAttempt;
    window.lioraMetrics.renderDashboard = () => renderDashboard({ isPremium: isUserPremium() });

    console.log("📊 dashboard.js iniciado (MVP local)");

    // ✅ quando pedir pra abrir dashboard: ativa a tela + renderiza
    window.addEventListener("liora:open-dashboard", () => {
      this.showScreen();
      window.lioraMetrics.renderDashboard();
    });

    // opcional: refresh manual
    window.addEventListener("liora:dashboard-refresh", () => {
      window.lioraMetrics.renderDashboard();
    });
  },
};
