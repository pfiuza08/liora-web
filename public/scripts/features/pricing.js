// =============================================================
// 💳 LIORA — PRICING (Tela de Planos)
// Versão: v1.0 (MVP produto, sem gateway real)
// -------------------------------------------------------------
// ✔ Mostra planos e CTAs
// ✔ Se usuário já é premium: mostra estado Premium ativo
// ✔ CTA "Assinar" simula upgrade local (marca user.premium=true)
// ✔ CTA "Tenho dúvidas" dispara modal premium (se existir)
// ✔ Reage ao evento canônico: liora:open-pricing
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

    // se user mudar (login/premium), re-render
    window.addEventListener("liora:user-changed", () => this.render());

    this.bindOnce();
    this.render(); // monta caso já esteja na tela
    console.log("💳 pricing.js iniciado");
  },

  showScreen() {
    // caso você use router.js para alternar telas, isso é redundante, mas é seguro.
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById("screen-pricing")?.classList.add("active");
  },

  // -----------------------------
  // State helpers
  // -----------------------------
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

  isLogged() {
    const u = this.getUser();
    return !!u?.uid || !!u?.email || !!u?.name;
  },

  isPremium() {
    const u = this.getUser();
    return !!u?.premium;
  },

  setPremiumLocal(on = true) {
    // MVP: marca premium local no store
    const u = this.getUser() || {};
    const next = { ...u, premium: !!on };

    try {
      this.ctx?.store?.set?.("user", next);
    } catch {}

    window.dispatchEvent(new Event("liora:user-changed"));
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  },

  // -----------------------------
  // Render
  // -----------------------------
  ensureRoot() {
    const screen = document.getElementById("screen-pricing");
    if (!screen) return null;

    // cria container interno, se não existir
    let root = screen.querySelector("#pricing-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "pricing-root";
      screen.appendChild(root);
    }
    return root;
  },

  render() {
    const root = this.ensureRoot();
    if (!root) {
      console.warn("⚠️ screen-pricing não encontrado no DOM.");
      return;
    }

    const premium = this.isPremium();
    const logged = this.isLogged();

    const statusPill = (() => {
      if (!logged) return `<span class="pill pill-base">visitante</span>`;
      if (premium) return `<span class="pill pill-mvp">premium</span>`;
      return `<span class="pill pill-upload">free</span>`;
    })();

    const premiumPanel = premium
      ? `
        <div class="panel" style="margin-bottom:12px;">
          <div class="card-title">Você já é Premium ✅</div>
          <div class="muted">Aproveite os recursos completos da Liora.</div>
          <div class="actions-row" style="margin-top:12px;">
            <button class="btn-secondary" data-nav="dashboard">Ir para dashboard</button>
            <button class="btn-secondary" data-nav="simulados">Ir para simulados</button>
            <button class="btn-secondary" data-action="pricingDisable">Desativar Premium (teste)</button>
          </div>
        </div>
      `
      : `
        <div class="panel" style="margin-bottom:12px;">
          <div class="card-title">Desbloquear Premium</div>
          <div class="muted">Mais insights, mais controle, mais evolução.</div>
          <div style="margin-top:10px;">Status: ${statusPill}</div>
        </div>
      `;

    const plans = [
      {
        id: "monthly",
        title: "Mensal",
        price: "R$ 19,90",
        sub: "por mês",
        bullets: ["Acesso Premium completo", "Insights no dashboard", "Revisões e métricas avançadas"],
        cta: "Assinar mensal",
        highlight: false
      },
      {
        id: "quarterly",
        title: "Trimestral",
        price: "R$ 49,90",
        sub: "a cada 3 meses",
        bullets: ["Melhor custo-benefício", "Acesso Premium completo", "Prioridade em novidades"],
        cta: "Assinar trimestral",
        highlight: true
      },
      {
        id: "lifetime",
        title: "Vitalício",
        price: "R$ 149,00",
        sub: "pagamento único",
        bullets: ["Premium para sempre", "Sem renovação", "Ideal para maratonas de estudo"],
        cta: "Quero vitalício",
        highlight: false
      }
    ];

    const plansHtml = `
      <div class="dash-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr)); gap:12px;">
        ${plans
          .map((p) => {
            const cls = p.highlight ? "dash-card good" : "dash-card";
            const disabled = premium ? "disabled" : "";
            return `
              <div class="${cls}">
                <div class="dash-title">${this.escape(p.title)}</div>
                <div class="dash-value">${this.escape(p.price)}</div>
                <div class="dash-sub">${this.escape(p.sub)}</div>

                <div class="dash-list" style="margin-top:10px;">
                  ${p.bullets.map((b) => `<div class="dash-row-sub">• ${this.escape(b)}</div>`).join("")}
                </div>

                <div class="actions-row" style="margin-top:12px;">
                  <button class="btn-primary" data-action="pricingBuy" data-plan="${this.escape(
                    p.id
                  )}" ${disabled}>${this.escape(p.cta)}</button>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;

    const foot = `
      <div class="panel" style="margin-top:12px;">
        <div class="card-title">Dúvidas?</div>
        <div class="muted">No MVP, o botão “Assinar” simula premium local. Depois plugamos Hotmart/Stripe.</div>
        <div class="actions-row" style="margin-top:12px;">
          <button class="btn-secondary" data-nav="home">Voltar</button>
          <button class="btn-secondary" data-action="pricingHelp">Falar sobre Premium</button>
        </div>
      </div>
    `;

    root.innerHTML = `
      ${premiumPanel}
      ${premium ? "" : plansHtml}
      ${foot}
    `;
  },

  // -----------------------------
  // Events
  // -----------------------------
  bindOnce() {
    if (this._bound) return;
    this._bound = true;

    document.addEventListener("click", (ev) => {
      const screen = ev.target.closest("#screen-pricing");
      if (!screen) return;

      const nav = ev.target.closest("[data-nav]");
      if (nav) {
        const to = (nav.getAttribute("data-nav") || "").trim().toLowerCase();
        if (to) this.nav(to);
        return;
      }

      const btn = ev.target.closest("[data-action]");
      if (!btn) return;

      const act = btn.getAttribute("data-action");
      if (!act) return;

      if (act === "pricingHelp") {
        // abre modal premium, se existir
        window.dispatchEvent(new Event("liora:premium-bloqueado"));
        return;
      }

      if (act === "pricingDisable") {
        this.setPremiumLocal(false);
        this.toast("Premium desativado (teste).");
        this.render();
        return;
      }

      if (act === "pricingBuy") {
        const plan = (btn.getAttribute("data-plan") || "monthly").trim();
        this.handleBuy(plan);
        return;
      }
    });
  },

  handleBuy(plan) {
    // Se quiser forçar login antes de assinar:
    if (this.ctx?.gates?.requireLogin) {
      const ok = this.ctx.gates.requireLogin();
      if (!ok) return;
    }

    // MVP: simula a compra
    this.setPremiumLocal(true);

    const label =
      plan === "quarterly" ? "trimestral" : plan === "lifetime" ? "vitalício" : "mensal";

    this.toast(`✅ Premium ativado (${label}).`);
    this.nav("dashboard");
  },

  nav(to) {
    try {
      // se você estiver usando router.js global
      window.router?.go?.(to);
      return;
    } catch {}

    // fallback canônico
    window.dispatchEvent(new CustomEvent("liora:nav", { detail: { to } }));
  },

  toast(msg) {
    try {
      this.ctx?.ui?.toast?.(msg);
    } catch {}
    console.log("🔔", msg);
  },

  escape(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
};
