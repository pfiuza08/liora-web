// =============================================================
// 💳 LIORA — PRICING (Tela de Planos)
// Versão: v1.2 (compatível com HTML estático do screen-pricing)
// -------------------------------------------------------------
// ✔ Usa HTML existente (não sobrescreve)
// ✔ Botões: data-action="pricingChoose" (free/premium)
// ✔ Botão: data-action="pricingLearnMore"
// ✔ Se premium já ativo: desabilita CTA e mostra toast
// ✔ Evento canônico: liora:open-pricing
// =============================================================

export const pricing = {
  ctx: null,
  _bound: false,

  init(ctx) {
    this.ctx = ctx;

    window.addEventListener("liora:open-pricing", () => this.render());
    window.addEventListener("liora:user-changed", () => this.render());

    this.bindOnce();
    this.render();

    console.log("💳 pricing.js iniciado (v1.2 compat HTML estático)");
  },

  // -----------------------------
  // State
  // -----------------------------
  getUser() {
    try {
      const u = this.ctx?.store?.get?.("user") || null;
      return u && typeof u === "object" ? u : null;
    } catch {
      return null;
    }
  },

  isPremium() {
    const u = this.getUser();
    return !!u?.premium;
  },

  setPremiumLocal(on = true) {
    const u = this.getUser() || {};
    const next = { ...u, premium: !!on };

    try {
      this.ctx?.store?.set?.("user", next);
    } catch {}

    window.dispatchEvent(new Event("liora:user-changed"));
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  },

  // -----------------------------
  // Render (não sobrescreve HTML)
  // -----------------------------
  render() {
    const screen = document.getElementById("screen-pricing");
    if (!screen) return;

    const premium = this.isPremium();

    // se já é premium: desabilita botões de ativação
    screen.querySelectorAll('[data-action="pricingChoose"][data-plan="premium"]').forEach((btn) => {
      btn.disabled = premium;
      btn.classList.toggle("is-disabled", premium);
      btn.textContent = premium ? "Premium ativo ✅" : "Ativar Premium";
    });

    // botão "continuar free" continua habilitado, mas se premium, vira um "voltar"
    screen.querySelectorAll('[data-action="pricingChoose"][data-plan="free"]').forEach((btn) => {
      btn.disabled = false;
      btn.textContent = premium ? "Continuar (já Premium)" : "Continuar no Free";
    });
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

      const btn = ev.target.closest("[data-action]");
      if (!btn) return;

      const act = btn.getAttribute("data-action");
      if (!act) return;

      if (act === "pricingLearnMore") {
        // abre seu modal premium (ou só mostra toast)
        window.dispatchEvent(new Event("liora:premium-bloqueado"));
        this.toast("✨ Premium libera insights e detalhes do dashboard.");
        return;
      }

      if (act === "pricingChoose") {
        const plan = (btn.getAttribute("data-plan") || "free").trim().toLowerCase();

        if (plan === "premium") {
          // se você quiser exigir login antes:
          if (this.ctx?.gates?.requireLogin) {
            const ok = this.ctx.gates.requireLogin();
            if (!ok) return;
          }

          if (this.isPremium()) {
            this.toast("Você já está Premium ✅");
            this.nav("dashboard");
            return;
          }

          this.setPremiumLocal(true);
          this.toast("✅ Premium ativado (modo MVP).");
          this.nav("dashboard");
          return;
        }

        // plan free
        this.toast(this.isPremium() ? "Você já é Premium ✅" : "Ok! Vamos de Free 🙂");
        this.nav("home");
        return;
      }
    });
  },

  nav(to) {
    try {
      window.router?.go?.(to);
    } catch {
      window.dispatchEvent(new CustomEvent("liora:nav", { detail: { to } }));
    }
  },

  toast(msg) {
    try {
      this.ctx?.ui?.toast?.(msg);
    } catch {}
  }
};
