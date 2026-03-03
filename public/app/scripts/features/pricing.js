// =============================================================
// 💳 LIORA — PRICING (Hotmart Checkout)
// Versão: v1.9 (Meta Pixel no app: ViewContent + InitiateCheckout)
// -------------------------------------------------------------
// ✔ Usa HTML existente (não sobrescreve)
// ✔ Botões: data-action="pricingChoose" (free/monthly/quarterly/lifetime)
// ✔ Compat: data-plan="premium" (trata como monthly)
// ✔ Botão: data-action="pricingLearnMore"
// ✔ Premium real: usa ctx.gates.isPremium() quando existir (fallback user.premium)
// ✔ Login: opcional (você decide via REQUIRE_LOGIN_BEFORE_PAY)
// ✔ Abre Hotmart em nova aba (mais confiável)
// ✔ Trimestral/Vitalício: "Em breve" (não abre checkout)
// ✔ Link normal (app): off=6mzlvtiy
// ✔ Founder fica só na landing: off=oplx5hku
// ✔ Meta Pixel: ViewContent ao abrir pricing + InitiateCheckout no clique
// =============================================================

export const pricing = {
  ctx: null,
  _bound: false,

  // ✅ Link "preço normal" (OFERTA NORMAL)
  HOTMART_PAY_URL: "https://pay.hotmart.com/I104401854N?off=6mzlvtiy",

  // ✅ defina se quer exigir login ANTES de pagar
  REQUIRE_LOGIN_BEFORE_PAY: false,

  // ✅ planos ainda não implementados
  COMING_SOON_PLANS: new Set(["quarterly", "lifetime"]),

  init(ctx) {
    this.ctx = ctx;

    window.addEventListener("liora:open-pricing", () => {
      this.render();
      this.trackMetaStandard("ViewContent", {
        content_name: "Planos Liora App",
        content_category: "pricing",
        content_type: "product_group"
      });
    });

    window.addEventListener("liora:open-plans", () => {
      this.render();
      this.trackMetaStandard("ViewContent", {
        content_name: "Planos Liora App",
        content_category: "pricing",
        content_type: "product_group"
      });
    }); // compat antigo

    window.addEventListener("liora:user-changed", () => this.render());

    this.bindOnce();
    this.render();

    console.log("💳 pricing.js iniciado (v1.9 Hotmart normal + Meta Pixel)");
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

  isLogged() {
    try {
      if (this.ctx?.gates?.isLogged) return !!this.ctx.gates.isLogged();
    } catch {}
    const u = this.getUser();
    return !!(u?.uid || u?.email || u?.name);
  },

  // -----------------------------
  // Render
  // -----------------------------
  render() {
    const screen = document.getElementById("screen-pricing");
    if (!screen) return;

    const premium = this.isPremium();

    screen.querySelectorAll('[data-action="pricingChoose"]').forEach((btn) => {
      const raw = (btn.getAttribute("data-plan") || "").trim().toLowerCase();
      const plan = raw === "premium" ? "monthly" : raw;
      const isFree = plan === "free";
      const isComingSoon = this.COMING_SOON_PLANS.has(plan);

      // Label do Free
      if (isFree) {
        btn.textContent = premium ? "Continuar (Premium ativo)" : "Continuar no Free";
      }

      // Em breve: desabilita sempre
      if (isComingSoon) {
        btn.disabled = true;
        btn.classList.add("is-disabled", "is-comingsoon");
        btn.setAttribute("title", "Em breve");
        return;
      }

      // Se já é premium, desabilita compra (exceto free)
      if (!isFree && premium) {
        btn.disabled = true;
        btn.classList.add("is-disabled");
        btn.setAttribute("title", "Premium já está ativo");
      } else {
        btn.disabled = false;
        btn.classList.remove("is-disabled");
        btn.classList.remove("is-comingsoon");
        btn.removeAttribute("title");
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

      // ✅ evita que algum <a> navegue antes do handler
      ev.preventDefault();

      if (act === "pricingLearnMore") {
        window.dispatchEvent(new Event("liora:premium-bloqueado"));
        this.toast("Premium libera recursos completos e remove limites.");
        return;
      }

      if (act !== "pricingChoose") return;

      const raw = (btn.getAttribute("data-plan") || "free").trim().toLowerCase();
      const plan = raw === "premium" ? "monthly" : raw;

      // Free: só navega
      if (plan === "free") {
        this.toast(this.isPremium() ? "Premium já está ativo." : "Ok. Você está no Free.");
        this.nav("home");
        return;
      }

      // Em breve: trimestral e vitalício
      if (this.COMING_SOON_PLANS.has(plan)) {
        this.toast("Esse plano ainda está em implementação. Por enquanto, só o Mensal está disponível.");
        return;
      }

      // Já é premium
      if (this.isPremium()) {
        this.toast("Premium já está ativo.");
        this.nav("dashboard");
        return;
      }

      // Opcional: exigir login antes de pagar
      if (this.REQUIRE_LOGIN_BEFORE_PAY && !this.isLogged()) {
        window.dispatchEvent(new Event("liora:login-required"));
        this.toast("Entre para continuar (depois você volta e finaliza a compra).");
        return;
      }

      // ✅ abre Hotmart (nova aba) - link normal do app (off=6mzlvtiy)
      const url = this._buildHotmartUrl(plan);

      this.trackMetaStandard("InitiateCheckout", {
        content_name: "Liora Mensal App",
        content_category: "subscription",
        content_type: "product",
        value: 19.90,
        currency: "BRL",
        plan: String(plan || "monthly")
      });

      this.toast("Abrindo checkout seguro…");

      try {
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (e) {
        location.href = url;
      }
    });
  },

  _buildHotmartUrl(plan) {
    // ✅ já vem com off=6mzlvtiy no HOTMART_PAY_URL
    const u = new URL(this.HOTMART_PAY_URL);

    // marcação simples:
    u.searchParams.set("src", "liora_app");
    u.searchParams.set("plan", String(plan || "monthly"));

    // Se quiser capturar usuário (email):
    try {
      const user = this.getUser();
      if (user?.email) u.searchParams.set("email", user.email);
    } catch {}

    return u.toString();
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
  },

  trackMetaStandard(eventName, params = {}) {
    try {
      if (typeof window.fbq === "function") {
        window.fbq("track", eventName, params);
      }
    } catch (e) {
      console.warn("[Meta Pixel]", e);
    }
  }
};
