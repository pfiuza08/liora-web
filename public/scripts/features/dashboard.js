// =============================================================
// 📊 LIORA — DASHBOARD (MVP local, de verdade)
// Versão: v1.3 (compatível com HTML estático do dashboard)
//
// HTML esperado em #screen-dashboard:
// - #dash-kpis       (grid de KPIs)
// - #dash-insights   (grid 2 colunas)
// - #dash-tables     (grid 2 colunas)
// - #dash-empty      (panel hidden)
// Opcional (JS cria se não existir):
// - #dash-top        (painéis extras: resumo, revisões, último resultado)
//
// Fonte: localStorage "liora_stats:v1"
// - attempts: { ts, date, banca, tema, dificuldade, mode, total, correct, timeSec }
// - sessions: (fica para Tema/PDF depois)
//
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

    window.addEventListener("liora:open-dashboard", () => {
      this.showScreen();
      this.render();
    });

    this.ensureShell();
    this.bindOnce();
    console.log("📊 dashboard.js iniciado (v1.3 compat HTML)");
  },

  showScreen() {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById("screen-dashboard")?.classList.add("active");
  },

  // -----------------------------
  // DOM helpers (usa HTML existente)
  // -----------------------------
  ensureShell() {
    const screen = document.getElementById("screen-dashboard");
    if (!screen) return;

    // cria um topo opcional para painéis extras
    if (!screen.querySelector("#dash-top")) {
      const top = document.createElement("div");
      top.id = "dash-top";

      // coloca logo depois do header do dashboard, antes dos panels
      const head = screen.querySelector(".screen-head");
      if (head && head.nextSibling) {
        screen.insertBefore(top, head.nextSibling);
      } else {
        screen.prepend(top);
      }
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

  isPremium() {
    const u = this.getUser();
    return !!u?.premium;
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
  // Render (preenche placeholders do HTML)
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

    // empty state
    if (!k.totalAttempts) {
      elEmpty.classList.remove("hidden");
      elKpis.innerHTML = "";
      elInsights.innerHTML = "";
      elTables.innerHTML = "";
      if (elTop) elTop.innerHTML = "";
      return;
    }

    elEmpty.classList.add("hidden");

    // helpers
    const chipMode = (m) => (String(m) === "disc" ? "DISC" : "OBJ");
    const fmtTime = (sec) => {
      const s = Math.max(0, Number(sec || 0));
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    };

    // topo (Resumo + Revisões + Último resultado)
    if (elTop) {
      const userLine = (() => {
        if (!u) return `<span class="pill pill-base">visitante</span>`;
        if (u.premium) return `<span class="pill pill-mvp">premium</span>`;
        return `<span class="pill pill-upload">free</span>`;
      })();

      const resumoHtml = `
        <div class="panel" style="margin-bottom:12px;">
          <div class="card-title">Resumo</div>
          <div class="muted">Dados locais · atualiza automaticamente</div>
          <div style="margin-top:10px;">${userLine}</div>

          <div class="actions-row" style="margin-top:12px;">
            <button class="btn-secondary" data-action="dashRefresh">Atualizar</button>
            ${premium ? "" : `<button class="btn-primary" data-action="dashUpgrade">Desbloquear Premium</button>`}
            <button class="btn-secondary" data-action="dashMock">Gerar exemplo</button>
          </div>
        </div>
      `;

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

      elTop.innerHTML = `${resumoHtml}${reviewHtml}${lastHtml}`;
    }

    // KPIs (preenche apenas o grid)
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
              <div class="dash-title">Tipos</div>
              <div class="dash-value">Premium</div>
              <div class="dash-sub">OBJ/DISC mais usado</div>
            </div>
          `
      }
    `;

    // Insights (2 colunas dentro do container)
    elInsights.innerHTML = premium
      ? `
        <div class="dash-card">
          <div class="dash-title">Melhor banca</div>
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
        </div>

        <div class="dash-card">
          <div class="dash-title">Dica</div>
          <div class="dash-value">${this.escape(k.focoAtual)}</div>
          <div class="dash-sub">Seu foco atual (free) pelo melhor desempenho.</div>
        </div>
      `;

    // Tabelas (2 colunas: bancaRank + last5)
    elTables.innerHTML = premium
      ? `
        <div class="dash-card">
          <div class="dash-title">Detalhes por banca</div>
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
        </div>

        <div class="dash-card">
          <div class="dash-title">Histórico (resumo)</div>
          <div class="dash-value">${k.totalAttempts}</div>
          <div class="dash-sub">simulados com pontuação registrada</div>
        </div>
      `;
  },

  // -----------------------------
  // Events (bind uma vez, sem duplicar listeners)
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

      if (act === "dashRefresh") return this.render();
      if (act === "dashUpgrade") return window.dispatchEvent(new Event("liora:premium-bloqueado"));

      if (act === "dashMock") {
        this.seedMock();
        window.dispatchEvent(new CustomEvent("liora:stats-changed", { detail: { type: "mock" } }));
        return this.render();
      }

      if (act === "dashOpenLastReview") {
        try { localStorage.setItem("liora_sim_open_review", "1"); } catch {}
        return this.nav("simulados");
      }

      if (act === "dashReviewNow") {
        try { localStorage.setItem("liora_review_start", "1"); } catch {}
        return this.nav("simulados");
      }

      if (act === "dashClearReview") {
        try { localStorage.setItem("liora_review_queue:v1", JSON.stringify({ items: [] })); } catch {}
        window.dispatchEvent(new CustomEvent("liora:stats-changed", { detail: { type: "review-queue" } }));
        return this.render();
      }

      // botão do seu empty state no HTML: data-action="startSimulado"
      if (act === "startSimulado") {
        this.nav("simulados");
        // pede start direto (simulados já escuta)
        window.dispatchEvent(new Event("liora:start-simulado"));
        return;
      }
    });
  },

  nav(to) {
    try { window.router?.go?.(to); } catch {}
    window.dispatchEvent(new CustomEvent("liora:nav", { detail: { to } }));
  },

  // -----------------------------
  // Mock
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

    localStorage.setItem(key, JSON.stringify(sample));
  },

  escape(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
};
