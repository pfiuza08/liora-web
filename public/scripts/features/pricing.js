// =============================================================
// 💳 LIORA — PRICING (Tela de Planos)
// Versão: v1.3 (3 planos + compat modal premium)
// -------------------------------------------------------------
// ✔ Usa HTML existente (não sobrescreve)
// ✔ Botões: data-action="pricingChoose" (free/monthly/quarterly/lifetime)
// ✔ Compat: data-plan="premium" (trata como mensal)
// ✔ Botão: data-action="pricingLearnMore"
// ✔ Eventos canônicos:
//    - liora:open-pricing
//    - liora:open-plans   (compat com premium.js antigo)
// =============================================================

export const pricing = {
  ctx: null,
  _bound: false,

  init(ctx) {
    this.ctx = ctx;

    // eventos canônicos
    window.addEventListener("liora:open-pricing", () => this.render());
    window.addEventListener("liora:open-plans", () => this.render()); // compat: premium.js antigo
    window.addEventListener("liora:user-changed", () => this.render());

    this.bindOnce();
    this.render();

    console.log("💳 pricing.js iniciado (v1.3 3 planos)");
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

    // todos os CTAs premium (mensal/trimestral/vitalício/premium)
    screen
      .querySelectorAll('[data-action="pricingChoose"]')
      .forEach((btn) => {
        const plan = (btn.getAttribute("data-plan") || "").trim().toLowerCase();
        const isFree = plan === "free";

        // se for premium ativo, desabilita os botões de compra
        if (!isFree && premium) {
          btn.disabled = true;
          btn.classList.add("is-disabled");
        } else {
          btn.disabled = false;
          btn.classList.remove("is-disabled");
        }

        // rótulo do botão free fica informativo
        if (isFree) {
          btn.textContent = premium ? "Continuar (Premium ativo)" : "Continuar no Free";
        }
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
        // abre modal premium (se existir) e mostra uma dica curta
        window.dispatchEvent(new Event("liora:premium-bloqueado"));
        this.toast("Premium libera insights e detalhes do dashboard.");
        return;
      }

      if (act === "pricingChoose") {
        const raw = (btn.getAttribute("data-plan") || "free").trim().toLowerCase();

        // compat com telas antigas
        const plan =
          raw === "premium" ? "monthly" : raw;

        if (plan === "free") {
          this.toast(this.isPremium() ? "Premium já está ativo." : "Ok. Você está no Free.");
          this.nav("home");
          return;
        }

        // se quiser exigir login antes de assinar
        if (this.ctx?.gates?.requireLogin) {
          const ok = this.ctx.gates.requireLogin();
          if (!ok) return;
        }

        if (this.isPremium()) {
          this.toast("Premium já está ativo.");
          this.nav("dashboard");
          return;
        }

        // MVP: ativa premium local
        this.setPremiumLocal(true);

        const label =
          plan === "quarterly" ? "trimestral" :
          plan === "lifetime" ? "vitalício" :
          "mensal";

        this.toast(`Premium ativado (${label}).`);
        this.nav("dashboard");
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
    console.log("🔔", msg);
  }
};
