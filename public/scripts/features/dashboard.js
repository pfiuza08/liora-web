// =============================================================
// 📊 LIORA — DASHBOARD (MVP local, de verdade)
// Versão: v1.2 (stats v1 + travas 2/3/4 + render automático)
//
// Fonte: localStorage "liora_stats:v1"
// - attempts: { ts, date, banca, tema, dificuldade, mode, total, correct, timeSec }
// - sessions: (fica para Tema/PDF depois)
//
// Eventos que atualizam:
// - liora:dashboard-refresh
// - liora:stats-changed
// =============================================================

export const dashboard = {
  ctx: null,

  init(ctx) {
    this.ctx = ctx;

    // render quando pedirem refresh
    window.addEventListener("liora:dashboard-refresh", () => this.render());

    // render quando stats mudarem (simulados/tarefas)
    window.addEventListener("liora:stats-changed", () => this.render());

    // render quando entrar na tela (se você disparar esse evento)
    window.addEventListener("liora:open-dashboard", () => {
      this.showScreen();
      this.render();
    });

    // render inicial leve (não força trocar de screen)
    this.ensureShell();
    console.log("📊 dashboard.js iniciado (MVP local de verdade)");
  },

  showScreen() {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById("screen-dashboard")?.classList.add("active");
    // se o dashboard pediu para iniciar revisão da fila
    try {
      const flag = localStorage.getItem("liora_review_start");
      if (flag === "1") {
        localStorage.removeItem("liora_review_start");

        const raw = localStorage.getItem("liora_review_queue:v1");
        const data = raw ? JSON.parse(raw) : { items: [] };
        const items = Array.isArray(data.items) ? data.items : [];

        if (items.length) {
          const first = items[0];

          // cria um "simulado" de 1 questão para revisão
          this.STATE.running = true;
          this.STATE.atual = 0;
          this.STATE.respostas = [];
          this.STATE.questoes = [
            first.tipo === "disc"
              ? {
                  tipo: "disc",
                  enunciado: first.enunciado,
                  respostaModelo: first.respostaModelo || "",
                  criterios: Array.isArray(first.criterios) ? first.criterios : []
                }
              : {
                  tipo: first.tipo === "ce" ? "ce" : "mcq",
                  enunciado: first.enunciado,
                  alternativas: Array.isArray(first.alternativas) && first.alternativas.length ? first.alternativas : ["Certo", "Errado"],
                  corretaIndex: Number.isInteger(first.corretaIndex) ? first.corretaIndex : 0,
                  explicacao: String(first.explicacao || "")
                }
          ];

          this.stopTimer();
          this.STATE.timer.totalSec = 0;
          this.STATE.timer.leftSec = 0;

          this.renderRunning();
          this.renderQuestion();
          this.setHint("Revisão rápida: responda e finalize.");
        }
      }
    } catch {}
  
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
      const items = Array.isArray(data.items) ? data.items : [];
      return items;
    } catch {
      return [];
    }
  },
 
  // -----------------------------
  // Last result (simulados)
  // -----------------------------
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

  buildLastResultCard() {
    const r = this.getLastResult();
    if (!r) return "";

    const totalScored = Number(r.totalScored || 0);
    const acertos = Number(r.acertos || 0);
    const pct = Number.isFinite(Number(r.pct)) ? Number(r.pct) : (totalScored ? Math.round((acertos / totalScored) * 100) : 0);

    const banca = String(r?.config?.banca || "—");
    const tema = String(r?.config?.tema || "Geral");
    const mode = String(r?.config?.mode || "obj");
    const modeLabel = mode === "disc" ? "DISC" : "OBJ";

    // se quiser mostrar data/hora: r.config não tem ts; então fica só “último”
    return `
      <div class="panel" style="margin:12px 0;">
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
            <div class="dash-value">${Number(r.total || 0)}</div>
            <div class="dash-sub">inclui discursivas</div>
          </div>
        </div>

        <div class="actions-row" style="margin-top:12px;">
          <button class="btn-secondary" data-nav="simulados">Ir para simulados</button>
          <button class="btn-primary" data-action="dashOpenLastReview">Ver revisão</button>
        </div>
      </div>
    `;
  },
  
  getUser() {
    // tenta alguns padrões comuns
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

      // banca
      const b = byBanca.get(banca) || { banca, total: 0, correct: 0, qs: 0 };
      b.total += 1;
      b.correct += Number(a.correct || 0);
      b.qs += Number(a.total || 0);
      byBanca.set(banca, b);

      // mode
      const m = byMode.get(mode) || { mode, total: 0 };
      m.total += 1;
      byMode.set(mode, m);

      // tema
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
  ensureShell() {
    const screen = document.getElementById("screen-dashboard");
    if (!screen) return;

    // se você já tem um HTML próprio, ok.
    // mas se não tiver #dash-body, criamos um container seguro.
    if (!screen.querySelector("#dash-body")) {
      const wrap = document.createElement("div");
      wrap.id = "dash-body";
      screen.appendChild(wrap);
    }
  },

  render() {
    const screen = document.getElementById("screen-dashboard");
    if (!screen) return;

    this.ensureShell();

    const wrap = screen.querySelector("#dash-body");
    if (!wrap) return;

    const premium = this.isPremium();
    const u = this.getUser();

    const k = this.compute();
    const reviewItems = this.reviewGetQueue();
    const reviewCount = reviewItems.length;


    // helpers de UI
    const chipMode = (m) => (String(m) === "disc" ? "DISC" : "OBJ");
    const fmtTime = (sec) => {
      const s = Math.max(0, Number(sec || 0));
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    };

    const locked = (html) => `
      <div class="dash-card dash-locked">
        <div class="dash-lock">Premium</div>
        ${html}
      </div>
    `;

    const emptyState = `
      <div class="panel">
        <div class="card-title">Ainda sem dados</div>
        <div class="muted">Faça um simulado para o dashboard começar a contar sua evolução.</div>
        <div class="actions-row">
          <button class="btn-primary" data-nav="simulados">Ir para Simulados</button>
          <button class="btn-secondary" data-action="dashMock">Gerar exemplo</button>
        </div>
      </div>
    `;

    // Se não tiver tentativas ainda:
    if (!k.totalAttempts) {
      wrap.innerHTML = emptyState;
      this.bindDashActions();
      return;
    }

    // Cards base (sempre liberados)
    const kpiHtml = `
      <div class="dash-grid" id="dash-kpis">
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
            : locked(`
                <div class="dash-title">Tipos</div>
                <div class="dash-value">Premium</div>
                <div class="dash-sub">OBJ/DISC mais usado</div>
              `)
        }
      </div>
    `;

    // Trava 2 (Insights)
    const insightsHtml = premium
      ? `
        <div class="panel">
          <div class="card-title">Insights</div>
          <div class="muted">Análises e recomendações</div>
          <div class="dash-list">
            <div class="dash-row">
              <div>
                <div class="dash-row-title">Melhor banca</div>
                <div class="dash-row-sub">maior acurácia acumulada</div>
              </div>
              <div class="dash-row-metric">${this.escape(k.bestBanca)}</div>
            </div>

            <div class="dash-row">
              <div>
                <div class="dash-row-title">Próximo passo sugerido</div>
                <div class="dash-row-sub">reforço do foco atual</div>
              </div>
              <div class="dash-row-metric">${this.escape(k.focoAtual)}</div>
            </div>
          </div>
        </div>
      `
      : `
        <div class="panel">
          <div class="card-title">Insights</div>
          <div class="muted">Análises e recomendações</div>
          ${locked(`<div class="dash-sub">Desbloqueie para ver insights automáticos.</div>`)}
        </div>
      `;

    // Trava 3/4 (Detalhes + Histórico)
    const detailsHtml = premium
      ? `
        <div class="panel">
          <div class="card-title">Detalhes</div>
          <div class="muted">Onde você mais ganha pontos</div>

          <div class="dash-list">
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

        <div class="panel">
          <div class="card-title">Histórico recente</div>
          <div class="muted">Últimos 5 simulados</div>

          <div class="dash-list">
            ${k.last5.map((a) => `
              <div class="dash-row">
                <div>
                  <div class="dash-row-title">${this.escape(a.banca)} · ${this.escape(a.tema)}</div>
                  <div class="dash-row-sub">${a.date} · ${chipMode(a.mode)} · ${fmtTime(a.timeSec)} </div>
                </div>
                <div class="dash-row-metric">${Math.round((a.correct / a.total) * 100)}%</div>
              </div>
            `).join("")}
          </div>
        </div>
      `
      : `
        <div class="panel">
          <div class="card-title">Detalhes</div>
          <div class="muted">Onde você mais ganha pontos</div>
          ${locked(`<div class="dash-sub">Breakdown por banca e histórico detalhado (Travas 3 e 4).</div>`)}
        </div>
      `;

    // header pequeno (mostra login/premium)
    const userLine = (() => {
      if (!u) return `<span class="pill pill-base">visitante</span>`;
      if (u.premium) return `<span class="pill pill-mvp">premium</span>`;
      return `<span class="pill pill-upload">free</span>`;
    })();

        const lastResultHtml = this.buildLastResultCard();

    wrap.innerHTML = `
      <div class="panel" style="margin-bottom:12px;">
        <div class="card-title">Resumo</div>
        <div class="muted">Dados locais · atualiza automaticamente</div>
        <div style="margin-top:10px;">${userLine}</div>

        <div class="actions-row">
          <button class="btn-secondary" data-action="dashRefresh">Atualizar</button>
          ${premium ? "" : `<button class="btn-primary" data-action="dashUpgrade">Desbloquear Premium</button>`}
        </div>
      </div>
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

      ${lastResultHtml}

      ${kpiHtml}
      ${insightsHtml}
      ${detailsHtml}
    `;

    this.bindDashActions();
  },

  bindDashActions() {
    const screen = document.getElementById("screen-dashboard");
    if (!screen) return;

    // navegação a partir do empty-state (data-nav) ou botões internos
    screen.querySelectorAll("[data-nav]").forEach((el) => {
      el.addEventListener("click", () => {
        const to = el.getAttribute("data-nav");
        if (!to) return;
        // tenta usar router se existir no window
        try {
          window.router?.go?.(to);
        } catch {}
        // fallback: evento canônico
        window.dispatchEvent(new CustomEvent("liora:nav", { detail: { to } }));
      });
    });

    const btnRefresh = screen.querySelector("[data-action='dashRefresh']");
    btnRefresh?.addEventListener("click", () => this.render());

    const btnLastReview = screen.querySelector("[data-action='dashOpenLastReview']");
    btnLastReview?.addEventListener("click", () => {
      // marca intenção de abrir revisão ao entrar em simulados
      try {
        localStorage.setItem("liora_sim_open_review", "1");
      } catch {}
      // navega para simulados
      try {
        window.router?.go?.("simulados");
      } catch {}
      window.dispatchEvent(new CustomEvent("liora:nav", { detail: { to: "simulados" } }));
    });

    
    const btnUpgrade = screen.querySelector("[data-action='dashUpgrade']");
    btnUpgrade?.addEventListener("click", () => {
      window.dispatchEvent(new Event("liora:premium-bloqueado"));
    });

     
    const btnMock = screen.querySelector("[data-action='dashMock']");
    btnMock?.addEventListener("click", () => {
      this.seedMock();
      this.render();
      window.dispatchEvent(new CustomEvent("liora:stats-changed"));
    });

    const btnReviewNow = screen.querySelector("[data-action='dashReviewNow']");
    btnReviewNow?.addEventListener("click", () => {
      try {
        localStorage.setItem("liora_review_start", "1");
      } catch {}
      window.dispatchEvent(new CustomEvent("liora:nav", { detail: { to: "simulados" } }));
    });

    const btnClearReview = screen.querySelector("[data-action='dashClearReview']");
    btnClearReview?.addEventListener("click", () => {
      try {
        localStorage.setItem("liora_review_queue:v1", JSON.stringify({ items: [] }));
      } catch {}
      window.dispatchEvent(new CustomEvent("liora:stats-changed", { detail: { type: "review-queue" } }));
      this.render();
    });
 
  },

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
