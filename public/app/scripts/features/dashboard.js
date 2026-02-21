// =============================================================
// 📊 LIORA — DASHBOARD (MVP local, de verdade)
// Versão: v1.6 (fix premium gate compat + re-render em user-changed)
// - Mantém Opção A (demo só no empty state; sem "Atualizar" no UI)
// - ✅ Premium robusto: suporta ctx.gates.isPremium() e ctx.gates.isPremium(store)
// - ✅ CTA Premium nunca aparece quando premium=true
// - Nav robusta: tenta ctx.router.go -> window.router.go
// - Botões de revisão: "Revisar agora" abre modo review queue no Simulados (liora_review_start=1)
// - "Ver revisão" abre a revisão do último resultado (liora_sim_open_review=1)
// =============================================================
//
// HTML esperado em #screen-dashboard:
// - #dash-kpis
// - #dash-insights
// - #dash-tables
// - #dash-empty
// Opcional (JS cria se não existir):
// - #dash-top
//
// Fonte: localStorage "liora_stats:v1"
// - attempts: { ts, date, banca, tema, dificuldade, mode, total, correct, timeSec }
// Extras:
// - revisão pendente: localStorage "liora_review_queue:v1" { items: [] }
// - último resultado: localStorage "liora_sim_last_result"
// =============================================================

export const dashboard = {
  ctx: null,
  _bound: false,

  init(ctx) {
    this.ctx = ctx;

    window.addEventListener("liora:dashboard-refresh", () => this.render());
    window.addEventListener("liora:stats-changed", () => this.render());

    // ✅ essencial: quando login/premium muda, re-renderiza a tela
    window.addEventListener("liora:user-changed", () => this.render());

    window.addEventListener("liora:open-dashboard", () => {
      this.showScreen();
      this.render();
    });

    this.ensureShell();
    this.bindOnce();
    console.log("📊 dashboard.js iniciado (v1.6)");
  },

  showScreen() {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById("screen-dashboard")?.classList.add("active");
  },

  // -----------------------------
  // DOM helpers
  // -----------------------------
  ensureShell() {
    const screen = document.getElementById("screen-dashboard");
    if (!screen) return;

    if (!screen.querySelector("#dash-top")) {
      const top = document.createElement("div");
      top.id = "dash-top";

      const head = screen.querySelector(".screen-head");
      if (head && head.nextSibling) screen.insertBefore(top, head.nextSibling);
      else screen.prepend(top);
    }
  },

  qs(id) {
    return document.getElementById(id);
  },

  // -----------------------------
  // Data
  // -----------------------------
  statsGet() {
    const key = "liora_stats:v1";
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : {};
      return {
        attempts: Array.isArray(data.attempts) ? data.attempts : [],
        sessions: Array.isArray(data.sessions) ? data.sessions : [],
        meta: data.meta && typeof data.meta === "object" ? data.meta : {}
      };
    } catch {
      return { attempts: [], sessions: [], meta: {} };
    }
  },

  reviewGetQueue() {
    const key = "liora_review_queue:v1";
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : {};
      return Array.isArray(data.items) ? data.items : [];
    } catch {
      return [];
    }
  },

  getLastResult() {
    const key = "liora_sim_last_result";
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : null;
      return data && typeof data === "object" ? data : null;
    } catch {
      return null;
    }
  },

  getUser() {
    try {
      const u =
        this.ctx?.store?.get?.("user") ||
        this.ctx?.store?.get?.("liora_user") ||
        null;
      return u && typeof u === "object" ? u : null;
    } catch {
      return null;
    }
  },

  // ✅ Premium robusto (compat com gates do app.js e gates.js v2)
  isPremium() {
    try {
      const g = this.ctx?.gates;

      // (A) createGates do app.js: isPremium() sem args
      // (B) gates.js v2: isPremium(store) com args
      if (g?.isPremium && typeof g.isPremium === "function") {
        if (g.isPremium.length >= 1) return !!g.isPremium(this.ctx?.store);
        return !!g.isPremium();
      }
    } catch {}

    // fallback: user.premium
    const u = this.getUser();
    return !!u?.premium;
  },

  // -----------------------------
  // CTA Premium (visitante vs free)
  // -----------------------------
  premiumCTA() {
    if (this.isPremium()) return ""; // ✅ premium nunca vê CTA

    const u = this.getUser();
    const isVisitor = !u;

    if (isVisitor) {
      return `
        <div class="actions-row" style="margin-top:10px;">
          <button class="btn-primary" data-action="dashLogin">Entrar para desbloquear</button>
        </div>
      `;
    }

    return `
      <div class="actions-row" style="margin-top:10px;">
        <button class="btn-primary" data-action="dashUpgrade">Desbloquear Premium</button>
      </div>
    `;
  },

  // -----------------------------
  // Compute KPIs
  // -----------------------------
  compute() {
    const { attempts } = this.statsGet();

    const scored = attempts.filter((a) => Number(a.total || 0) > 0);
    const totalAttempts = scored.length;

    const sumTotal = scored.reduce((acc, a) => acc + Number(a.total || 0), 0);
    const sumCorrect = scored.reduce((acc, a) => acc + Number(a.correct || 0), 0);
    const pct = sumTotal ? Math.round((sumCorrect / sumTotal) * 100) : 0;

    const byBanca = new Map();
    const byMode = new Map();
    const byTema = new Map();

    for (const a of scored) {
      const banca = String(a.banca || "—");
      const mode = String(a.mode || "obj");
      const tema = String(a.tema || "Geral");

      const b = byBanca.get(banca) || { banca, total: 0, correct: 0, qs: 0 };
      b.total += 1;
      b.correct += Number(a.correct || 0);
      b.qs += Number(a.total || 0);
      byBanca.set(banca, b);

      const m = byMode.get(mode) || { mode, total: 0 };
      m.total += 1;
      byMode.set(mode, m);

      const t = byTema.get(tema) || { tema, total: 0, correct: 0, qs: 0 };
      t.total += 1;
      t.correct += Number(a.correct || 0);
      t.qs += Number(a.total || 0);
      byTema.set(tema, t);
    }

    const bancaRank = [...byBanca.values()]
      .map((x) => ({ ...x, pct: x.qs ? Math.round((x.correct / x.qs) * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct);

    const bestBanca = bancaRank[0]?.banca || "—";

    const modeRank = [...byMode.values()].sort((a, b) => b.total - a.total);
    const topMode = modeRank[0]?.mode || "obj";

    const temaRank = [...byTema.values()]
      .map((x) => ({ ...x, pct: x.qs ? Math.round((x.correct / x.qs) * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct);

    const focoAtual = temaRank[0]?.tema || "Geral";

    const last5 = scored
      .slice()
      .sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0))
      .slice(0, 5);

    return {
      totalAttempts,
      sumTotal,
      sumCorrect,
      pct,
      bestBanca,
      topMode,
      focoAtual,
      bancaRank,
      temaRank,
      last5
    };
  },

  // -----------------------------
  // Render
  // -----------------------------
  render() {
    this.ensureShell();

    const elTop = this.qs("dash-top");
    const elKpis = this.qs("dash-kpis");
    const elInsights = this.qs("dash-insights");
    const elTables = this.qs("dash-tables");
    const elEmpty = this.qs("dash-empty");

    if (!elKpis || !elInsights || !elTables || !elEmpty) {
      console.warn("⚠️ Dashboard HTML não tem containers esperados.");
      return;
    }

    const u = this.getUser();
    const premium = this.isPremium();
    const k = this.compute();

    const reviewCount = this.reviewGetQueue().length;
    const last = this.getLastResult();

    // helpers
    const chipMode = (m) => (String(m) === "disc" ? "DISC" : "OBJ");
    const fmtTime = (sec) => {
      const s = Math.max(0, Number(sec || 0));
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    };

    const userLine = (() => {
      if (!u) return `<div class="muted small">Status: visitante</div>`;
      if (premium) return `<div class="muted small">Status: Premium</div>`;
      return `<div class="muted small">Status: Free</div>`;
    })();

    // -----------------------------
    // EMPTY (Opção A)
    // -----------------------------
    if (!k.totalAttempts) {
      elEmpty.classList.remove("hidden");
      elKpis.innerHTML = "";
      elInsights.innerHTML = "";
      elTables.innerHTML = "";

      if (elTop) {
        elTop.innerHTML = `
          <div class="panel" style="margin-bottom:12px;">
            <div class="card-title">Resumo</div>
            <div class="muted">Ainda não há dados de desempenho.</div>
            <div style="margin-top:10px;">${userLine}</div>

            <div class="actions-row" style="margin-top:12px; flex-wrap:wrap;">
              <button class="btn-primary" data-action="dashStartFirst">Fazer 1º simulado</button>
              <button class="btn-secondary" data-action="dashDemo">Ver demonstração</button>
              ${premium ? "" : `<button class="btn-secondary" data-action="dashUpgrade">Desbloquear Premium</button>`}
            </div>

            <div class="muted small" style="margin-top:10px;">
              Dica: “Ver demonstração” preenche dados fictícios para você avaliar o dashboard.
            </div>
          </div>
        `;
      }

      return;
    }

    // tem dados
    elEmpty.classList.add("hidden");

    // -----------------------------
    // TOP (com dados)
    // -----------------------------
    if (elTop) {
      const reviewHtml = `
        <div class="panel" style="margin-bottom:12px;">
          <div class="card-title">Revisões pendentes</div>
          <div class="muted">Erradas e marcadas</div>

          <div class="dash-grid" style="margin-top:10px;">
            <div class="dash-card">
              <div class="dash-title">Na fila</div>
              <div class="dash-value">${reviewCount}</div>
              <div class="dash-sub">itens para revisar</div>
            </div>
          </div>

          <div class="actions-row" style="margin-top:12px;">
            <button class="btn-primary" data-action="dashReviewNow" ${reviewCount ? "" : "disabled"}>Revisar agora</button>
            <button class="btn-secondary" data-action="dashClearReview" ${reviewCount ? "" : "disabled"}>Limpar fila</button>
          </div>
        </div>
      `;

      const lastHtml = (() => {
        if (!last) return "";
        const totalScored = Number(last.totalScored || 0);
        const acertos = Number(last.acertos || 0);
        const pct = Number.isFinite(Number(last.pct))
          ? Number(last.pct)
          : (totalScored ? Math.round((acertos / totalScored) * 100) : 0);

        const banca = String(last?.config?.banca || "—");
        const tema = String(last?.config?.tema || "Geral");
        const mode = String(last?.config?.mode || "obj");
        const modeLabel = mode === "disc" ? "DISC" : "OBJ";

        return `
          <div class="panel" style="margin-bottom:12px;">
            <div class="card-title">Último resultado</div>
            <div class="muted">${this.escape(banca)} · ${this.escape(tema)} · <b>${this.escape(modeLabel)}</b></div>

            <div class="dash-grid" style="margin-top:10px;">
              <div class="dash-card good">
                <div class="dash-title">Acurácia</div>
                <div class="dash-value">${pct}%</div>
                <div class="dash-sub">${acertos} acertos / ${totalScored} objetivas</div>
              </div>

              <div class="dash-card">
                <div class="dash-title">Total de itens</div>
                <div class="dash-value">${Number(last.total || 0)}</div>
                <div class="dash-sub">inclui discursivas</div>
              </div>
            </div>

            <div class="actions-row" style="margin-top:12px;">
              <button class="btn-secondary" data-nav="simulados">Ir para simulados</button>
              <button class="btn-primary" data-action="dashOpenLastReview">Ver revisão</button>
            </div>
          </div>
        `;
      })();

      elTop.innerHTML = `
        <div class="panel" style="margin-bottom:12px;">
          <div class="card-title">Resumo</div>
          <div class="muted">Dados locais · atualiza automaticamente</div>
          <div style="margin-top:10px;">${userLine}</div>
        </div>
        ${reviewHtml}
        ${lastHtml}
      `;
    }

    // KPIs
    elKpis.innerHTML = `
      <div class="dash-card good">
        <div class="dash-title">Acurácia geral</div>
        <div class="dash-value">${k.pct}%</div>
        <div class="dash-sub">${k.sumCorrect} acertos / ${k.sumTotal} questões</div>
      </div>

      <div class="dash-card">
        <div class="dash-title">Simulados concluídos</div>
        <div class="dash-value">${k.totalAttempts}</div>
        <div class="dash-sub">com questões pontuadas</div>
      </div>

      <div class="dash-card ok">
        <div class="dash-title">Foco atual</div>
        <div class="dash-value">${this.escape(k.focoAtual)}</div>
        <div class="dash-sub">tema com melhor desempenho</div>
      </div>

      ${
        premium
          ? `
            <div class="dash-card dash-kpi-types">
              <div class="dash-title">Tipos</div>
              <div class="dash-value">${chipMode(k.topMode)}</div>
              <div class="dash-sub">modo mais usado</div>
            </div>
          `
          : `
            <div class="dash-card dash-locked">
              <div class="dash-lock">Premium</div>
              <div class="dash-title">Insights</div>
              <div class="dash-value">Bloqueado</div>
              <div class="dash-sub">Desbloqueie para recomendações automáticas.</div>
              ${this.premiumCTA()}
            </div>
          `
      }
    `;

    // Insights
    elInsights.innerHTML = premium
      ? `
        <div class="dash-card">
          <div class="dash-title">Melhor exame</div>
          <div class="dash-value">${this.escape(k.bestBanca)}</div>
          <div class="dash-sub">maior acurácia acumulada</div>
        </div>

        <div class="dash-card">
          <div class="dash-title">Próximo passo sugerido</div>
          <div class="dash-value">${this.escape(k.focoAtual)}</div>
          <div class="dash-sub">reforço do foco atual</div>
        </div>
      `
      : `
        <div class="dash-card dash-locked">
          <div class="dash-lock">Premium</div>
          <div class="dash-title">Insights</div>
          <div class="dash-value">Bloqueado</div>
          <div class="dash-sub">Desbloqueie para recomendações automáticas.</div>
          ${this.premiumCTA()}
        </div>

        <div class="dash-card">
          <div class="dash-title">Dica</div>
          <div class="dash-value">${this.escape(k.focoAtual)}</div>
          <div class="dash-sub">Seu foco atual (free) pelo melhor desempenho.</div>
        </div>
      `;

    // Tables
    elTables.innerHTML = premium
      ? `
        <div class="dash-card">
          <div class="dash-title">Detalhes por exame</div>
          <div class="dash-sub">Onde você mais ganha pontos</div>
          <div class="dash-list" style="margin-top:10px;">
            ${k.bancaRank.slice(0, 6).map((b) => `
              <div class="dash-row">
                <div>
                  <div class="dash-row-title">${this.escape(b.banca)}</div>
                  <div class="dash-row-sub">${b.total} simulados · ${b.qs} questões</div>
                </div>
                <div class="dash-row-metric">${b.pct}%</div>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="dash-card">
          <div class="dash-title">Histórico recente</div>
          <div class="dash-sub">Últimos 5 simulados</div>
          <div class="dash-list" style="margin-top:10px;">
            ${k.last5.map((a) => `
              <div class="dash-row">
                <div>
                  <div class="dash-row-title">${this.escape(a.banca)} · ${this.escape(a.tema)}</div>
                  <div class="dash-row-sub">${a.date} · ${chipMode(a.mode)} · ${fmtTime(a.timeSec)}</div>
                </div>
                <div class="dash-row-metric">${Math.round((a.correct / a.total) * 100)}%</div>
              </div>
            `).join("")}
          </div>
        </div>
      `
      : `
        <div class="dash-card dash-locked">
          <div class="dash-lock">Premium</div>
          <div class="dash-title">Detalhes</div>
          <div class="dash-value">Bloqueado</div>
          <div class="dash-sub">Breakdown por banca e histórico detalhado.</div>
          ${this.premiumCTA()}
        </div>

        <div class="dash-card">
          <div class="dash-title">Histórico (resumo)</div>
          <div class="dash-value">${k.totalAttempts}</div>
          <div class="dash-sub">simulados com pontuação registrada</div>
        </div>
      `;
  },

  // -----------------------------
  // Events (bind uma vez)
  // -----------------------------
  bindOnce() {
    if (this._bound) return;
    this._bound = true;

    const screen = document.getElementById("screen-dashboard");
    if (!screen) return;

    screen.addEventListener("click", (ev) => {
      const nav = ev.target.closest("[data-nav]");
      if (nav) {
        const to = nav.getAttribute("data-nav");
        if (to) this.nav(to);
        return;
      }

      const btn = ev.target.closest("[data-action]");
      if (!btn) return;
      const act = btn.getAttribute("data-action");

      if (act === "dashUpgrade") {
        window.dispatchEvent(new Event("liora:premium-bloqueado"));
        this.nav("pricing");
        return;
      }

      if (act === "dashLogin") {
        return window.dispatchEvent(new Event("liora:login-required"));
      }

      // Opção A: demo só no estado inicial
      if (act === "dashDemo") {
        this.seedMock();
        window.dispatchEvent(new CustomEvent("liora:stats-changed", { detail: { type: "mock" } }));
        this.render();
        return;
      }

      if (act === "dashStartFirst") {
        this.nav("simulados");
        window.dispatchEvent(new Event("liora:start-simulado"));
        return;
      }

      if (act === "dashOpenLastReview") {
        try { localStorage.setItem("liora_sim_open_review", "1"); } catch {}
        this.nav("simulados");
        return;
      }

      if (act === "dashReviewNow") {
        try { localStorage.setItem("liora_review_start", "1"); } catch {}
        this.nav("simulados");
        return;
      }

      if (act === "dashClearReview") {
        try { localStorage.setItem("liora_review_queue:v1", JSON.stringify({ items: [] })); } catch {}
        window.dispatchEvent(new CustomEvent("liora:stats-changed", { detail: { type: "review-queue" } }));
        window.dispatchEvent(new Event("liora:dashboard-refresh"));
        this.render();
        return;
      }

      // botão do seu empty state antigo no HTML: data-action="startSimulado"
      if (act === "startSimulado") {
        this.nav("simulados");
        window.dispatchEvent(new Event("liora:start-simulado"));
        return;
      }
    });
  },

  // nav robusta
  nav(to) {
    const dest = String(to || "");
    try {
      if (this.ctx?.router?.go) this.ctx.router.go(dest);
      else window.router?.go?.(dest);
    } catch {}
    window.dispatchEvent(new CustomEvent("liora:nav", { detail: { to: dest } }));
  },

  // -----------------------------
  // Mock (demo)
  // -----------------------------
  seedMock() {
    const key = "liora_stats:v1";
    const now = Date.now();
    const pad = (n) => String(n).padStart(2, "0");
    const iso = (ts) => {
      const d = new Date(ts);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    const sample = {
      attempts: [
        { ts: now - 1 * 86400000, date: iso(now - 1 * 86400000), banca: "FGV", tema: "Direito Adm", dificuldade: "médio", mode: "obj", total: 10, correct: 8, timeSec: 780 },
        { ts: now - 2 * 86400000, date: iso(now - 2 * 86400000), banca: "CESPE", tema: "Constitucional", dificuldade: "misturado", mode: "obj", total: 12, correct: 7, timeSec: 920 },
        { ts: now - 3 * 86400000, date: iso(now - 3 * 86400000), banca: "FGV", tema: "Direito Adm", dificuldade: "fácil", mode: "obj", total: 8, correct: 7, timeSec: 610 }
      ],
      sessions: [],
      meta: {}
    };

    try {
      localStorage.setItem(key, JSON.stringify(sample));
    } catch (e) {
      console.warn("⚠️ seedMock falhou:", e);
    }
  },

  escape(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
};
