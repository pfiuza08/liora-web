// =============================================================
// 💳 LIORA — PRICING / PAYWALL (Planos de assinatura)
// Arquivo: pricing.js
// Versão: v1.0
//
// ✔ Screen própria (#screen-pricing)
// ✔ Cards Free / Premium
// ✔ CTA inteligente (visitante / free / premium)
// ✔ Eventos canônicos:
//   - liora:open-pricing
//   - liora:premium-bloqueado
//   - liora:login-required
// ✔ Modo DEMO opcional: ativar premium local (para testar fluxo)
// =============================================================

export const pricing = {
  ctx: null,
  _bound: false,

  init(ctx) {
    this.ctx = ctx;

    window.addEventListener("liora:open-pricing", () => {
      this.showScreen();
      this.render();
    });

    window.addEventListener("liora:user-changed", () => this.render());
    window.addEventListener("liora:auth-changed", () => this.render());

    this.ensureShell();
    this.bindOnce();

    console.log("💳 pricing.js iniciado (v1.0)");
  },

  // -----------------------------
  // Screen
  // -----------------------------
  showScreen() {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById("screen-pricing")?.classList.add("active");
  },

  ensureShell() {
    if (document.getElementById("screen-pricing")) return;

    const app = document.querySelector("main") || document.body;

    const sec = document.createElement("section");
    sec.className = "screen";
    sec.id = "screen-pricing";

    sec.innerHTML = `
      <div class="screen-head">
        <a class="back-link" data-nav="dashboard">← Voltar</a>
        <h2>Planos</h2>
        <div class="muted">Escolha o nível de poder do seu estudo 🧠⚡</div>
      </div>

      <div id="pricing-body"></div>
    `;

    app.appendChild(sec);
  },

  qs(id) {
    return document.getElementById(id);
  },

  // -----------------------------
  // User state
  // -----------------------------
  getUser() {
    try {
      return (
        this.ctx?.store?.get?.("user") ||
        this.ctx?.store?.get?.("liora_user") ||
        (() => {
          try {
            const raw = localStorage.getItem("liora_user");
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        })()
      );
    } catch {
      return null;
    }
  },

  isLogged() {
    const u = this.getUser();
    return !!u?.email || !!u?.uid || !!u?.name;
  },

  isPremium() {
    const u = this.getUser();
    return !!u?.premium;
  },

  // -----------------------------
  // Render
  // -----------------------------
  render() {
    this.ensureShell();

    const el = this.qs("pricing-body");
    if (!el) return;

    const logged = this.isLogged();
    const premium = this.isPremium();

    const badge = premium
      ? `<span class="pill pill-mvp">premium</span>`
      : logged
        ? `<span class="pill pill-upload">free</span>`
        : `<span class="pill pill-base">visitante</span>`;

    // CTA rules
    const ctaLabel = premium
      ? "Você já é Premium ✅"
      : logged
        ? "Assinar Premium"
        : "Entrar para assinar";

    const ctaAction = premium
      ? "noop"
      : logged
        ? "buyPremium"
        : "loginToBuy";

    el.innerHTML = `
      <div class="panel" style="margin-bottom:12px;">
        <div class="card-title">Seu status</div>
        <div style="margin-top:10px;">${badge}</div>
      </div>

      <div class="dash-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr)); gap:12px;">
        ${this.cardFree({ premium })}
        ${this.cardPremiumMensal({ premium, ctaLabel, ctaAction })}
        ${this.cardPremiumLife({ premium, ctaLabel, ctaAction })}
      </div>

      <div class="panel" style="margin-top:12px;">
        <div class="muted small">
          * MVP: checkout real (Hotmart/Stripe/Mercado Pago) entra depois.  
          Por enquanto, “Assinar Premium” dispara o fluxo de upgrade que você já usa.
        </div>

        <div class="actions-row" style="margin-top:10px;">
          <button class="btn-secondary" data-action="demoOn">Ativar Premium (DEMO)</button>
          <button class="btn-secondary" data-action="demoOff">Voltar para Free</button>
        </div>
      </div>
    `;
  },

  cardFree({ premium }) {
    return `
      <div class="dash-card ${premium ? "" : "good"}">
        <div class="dash-title">Free</div>
        <div class="dash-value">R$ 0</div>
        <div class="dash-sub">Para começar agora</div>

        <div class="dash-list" style="margin-top:10px;">
          <div class="dash-row"><div>Simulados OBJ</div><div class="dash-row-metric">✓</div></div>
          <div class="dash-row"><div>Revisão básica</div><div class="dash-row-metric">✓</div></div>
          <div class="dash-row"><div>Insights avançados</div><div class="dash-row-metric">—</div></div>
        </div>

        <div class="actions-row" style="margin-top:12px;">
          <button class="btn-secondary" data-action="goSimulados">Fazer simulado</button>
        </div>
      </div>
    `;
  },

  cardPremiumMensal({ premium, ctaLabel, ctaAction }) {
    return `
      <div class="dash-card ${premium ? "good" : ""}">
        <div class="dash-title">Premium Mensal</div>
        <div class="dash-value">R$ 19,90</div>
        <div class="dash-sub">Velocidade de cruzeiro</div>

        <div class="dash-list" style="margin-top:10px;">
          <div class="dash-row"><div>OBJ + DISC</div><div class="dash-row-metric">✓</div></div>
          <div class="dash-row"><div>Insights</div><div class="dash-row-metric">✓</div></div>
          <div class="dash-row"><div>Detalhes por banca</div><div class="dash-row-metric">✓</div></div>
        </div>

        <div class="actions-row" style="margin-top:12px;">
          <button class="btn-primary" data-action="${ctaAction}" ${premium ? "disabled" : ""}>
            ${ctaLabel}
          </button>
        </div>
      </div>
    `;
  },

  cardPremiumLife({ premium, ctaLabel, ctaAction }) {
    return `
      <div class="dash-card ${premium ? "" : "ok"}">
        <div class="dash-title">Premium Vitalício</div>
        <div class="dash-value">R$ 149</div>
        <div class="dash-sub">Modo turbina</div>

        <div class="dash-list" style="margin-top:10px;">
          <div class="dash-row"><div>Tudo do Premium</div><div class="dash-row-metric">✓</div></div>
          <div class="dash-row"><div>Recursos futuros</div><div class="dash-row-metric">✓</div></div>
          <div class="dash-row"><div>Prioridade</div><div class="dash-row-metric">✓</div></div>
        </div>

        <div class="actions-row" style="margin-top:12px;">
          <button class="btn-secondary" data-action="${ctaAction}" ${premium ? "disabled" : ""}>
            ${premium ? "Ativo ✅" : "Assinar (quando lançar)"}
          </button>
        </div>
      </div>
    `;
  },

  // -----------------------------
  // Events
  // -----------------------------
  bindOnce() {
    if (this._bound) return;
    this._bound = true;

    const screen = document.getElementById("screen-pricing");
    if (!screen) return;

    screen.addEventListener("click", (ev) => {
      const nav = ev.target.closest("[data-nav]");
      if (nav) {
        const to = nav.getAttribute("data-nav");
        if (to) return this.nav(to);
      }

      const btn = ev.target.closest("[data-action]");
      if (!btn) return;

      const act = btn.getAttribute("data-action");

      if (act === "goSimulados") {
        this.nav("simulados");
        return;
      }

      if (act === "loginToBuy") {
        window.dispatchEvent(new Event("liora:login-required"));
        return;
      }

      if (act === "buyPremium") {
        window.dispatchEvent(new Event("liora:premium-bloqueado"));
        return;
      }

      if (act === "demoOn") return this.demoSetPremium(true);
      if (act === "demoOff") return this.demoSetPremium(false);
    });
  },

  nav(to) {
    try { window.router?.go?.(to); } catch {}
    window.dispatchEvent(new CustomEvent("liora:nav", { detail: { to } }));
  },

  // -----------------------------
  // DEMO (opcional)
  // -----------------------------
  demoSetPremium(on) {
    try {
      const u = this.getUser() || {};
      const next = { ...u, premium: !!on };

      this.ctx?.store?.set?.("user", next);

      try { localStorage.setItem("liora_user", JSON.stringify(next)); } catch {}

      window.dispatchEvent(new Event("liora:user-changed"));
      this.render();
    } catch (e) {
      console.warn("⚠️ demoSetPremium falhou:", e);
    }
  }
};
