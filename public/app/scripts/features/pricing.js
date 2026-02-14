// =============================================================
// 💳 LIORA — PRICING (Tela de Planos)
// Versão: v1.4 (3 planos + compat + gates + CTA consistente)
// -------------------------------------------------------------
// ✔ Usa HTML existente (não sobrescreve)
// ✔ Botões: data-action="pricingChoose" (free/monthly/quarterly/lifetime)
// ✔ Compat: data-plan="premium" (trata como monthly)
// ✔ Botão: data-action="pricingLearnMore"
// ✔ Premium real: usa ctx.gates.isPremium() quando existir (fallback user.premium)
// ✔ Login: se existir ctx.gates.requireLogin(), respeita
// ✔ Eventos canônicos:
//    - liora:open-pricing
//    - liora:open-plans   (compat com premium.js antigo)
//    - liora:user-changed (re-render)
// =============================================================

export const pricing = {
  ctx: null,
  _bound: false,

  init(ctx) {
    this.ctx = ctx;

    // eventos canônicos
    window.addEventListener("liora:open-pricing", () => this.render());
    window.addEventListener("liora:open-plans", () => this.render()); // compat antigo
    window.addEventListener("liora:user-changed", () => this.render());

    this.bindOnce();
    this.render();

    console.log("💳 pricing.js iniciado (v1.4)");
  },

  // -----------------------------
  // State
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

  isPremium() {
    try {
      if (this.ctx?.gates?.isPremium) return !!this.ctx.gates.isPremium();
    } catch {}
    const u = this.getUser();
    return !!u?.premium;
  },

  setPremiumLocal(on = true, meta = {}) {
    const u = this.getUser() || {};
    const next = {
      ...u,
      premium: !!on,
      premiumMeta: on
        ? {
            plan: meta.plan || "monthly",
            activatedAt: Date.now(),
            source: meta.source || "pricing"
          }
        : null
    };

    try {
      this.ctx?.store?.set?.("user", next);
    } catch {}

    // eventos úteis
    window.dispatchEvent(new Event("liora:user-changed"));
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
    window.dispatchEvent(new CustomEvent("liora:premium-changed", { detail: { premium: !!on, ...meta } }));
  },

  // -----------------------------
  // Render (não sobrescreve HTML)
  // -----------------------------
  render() {
    const screen = document.getElementById("screen-pricing");
    if (!screen) return;

    const premium = this.isPremium();

    // CTAs premium (mensal/trimestral/vitalício/premium)
    screen.querySelectorAll('[data-action="pricingChoose"]').forEach((btn) => {
      const plan = (btn.getAttribute("data-plan") || "").trim().toLowerCase();
      const isFree = plan === "free";

      // premium ativo: desabilita compras, mas mantém o free informativo
      if (!isFree && premium) {
        btn.disabled = true;
        btn.classList.add("is-disabled");
      } else {
        btn.disabled = false;
        btn.classList.remove("is-disabled");
      }

      if (isFree) {
        btn.textContent = premium ? "Continuar (Premium ativo)" : "Continuar no Free";
      } else if (premium) {
        // não muda o texto do HTML, só adiciona um hint opcional
        btn.setAttribute("title", "Premium já está ativo");
      } else {
        btn.removeAttribute("title");
      }
    });

    // opcional: marca visual de plano atual, se seu HTML usar data-plan-badge
    screen.querySelectorAll("[data-plan-badge]").forEach((el) => {
      const p = (el.getAttribute("data-plan-badge") || "").toLowerCase();
      el.classList.toggle("active", premium && p !== "free");
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
        window.dispatchEvent(new Event("liora:premium-bloqueado"));
        this.toast("Premium libera insights, detalhes e revisão guiada.");
        return;
      }

      if (act !== "pricingChoose") return;

      const raw = (btn.getAttribute("data-plan") || "free").trim().toLowerCase();
      const plan = raw === "premium" ? "monthly" : raw;

      // free
      if (plan === "free") {
        this.toast(this.isPremium() ? "Premium já está ativo." : "Ok. Você está no Free.");
        this.nav("home");
        return;
      }

      // exige login (se existir)
      try {
        if (this.ctx?.gates?.requireLogin) {
          const ok = this.ctx.gates.requireLogin();
          if (!ok) return;
        }
      } catch {}

      // já é premium
      if (this.isPremium()) {
        this.toast("Premium já está ativo.");
        this.nav("dashboard");
        return;
      }

      // MVP: ativa premium local
      this.setPremiumLocal(true, { plan, source: "pricing" });

      const label =
        plan === "quarterly" ? "trimestral" :
        plan === "lifetime" ? "vitalício" :
        "mensal";

      this.toast(`Premium ativado (${label}).`);
      this.nav("dashboard");
    });
  },

  nav(to) {
    const dest = String(to || "");
    try {
      if (this.ctx?.router?.go) this.ctx.router.go(dest);
      else window.router?.go?.(dest);
    } catch {}
    window.dispatchEvent(new CustomEvent("liora:nav", { detail: { to: dest } }));
  },

  toast(msg) {
    try {
      this.ctx?.ui?.toast?.(msg);
    } catch {}
    console.log("🔔", msg);
  }
};
