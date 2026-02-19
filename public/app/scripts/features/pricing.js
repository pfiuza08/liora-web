// =============================================================
// 💳 LIORA — PRICING (Tela de Planos)
// Versão: v1.5 (Hotmart + Supabase magic link + consume-pending + CTA consistente)
// -------------------------------------------------------------
// ✔ Usa HTML existente (não sobrescreve)
// ✔ Botões: data-action="pricingChoose" (free/monthly/quarterly/lifetime)
// ✔ Compat: data-plan="premium" (trata como monthly)
// ✔ Botão: data-action="pricingLearnMore"
// ✔ Premium real: usa ctx.gates.isPremium(store) quando existir (fallback store.user.premium)
// ✔ Login: se existir ctx.gates.requireLogin(), respeita
// ✔ Hotmart: abre checkout em nova aba + inicia "watch" (poll no profiles/consume-pending)
// ✔ Eventos canônicos:
//    - liora:open-pricing
//    - liora:open-plans   (compat com premium.js antigo)
//    - liora:user-changed (re-render)
// =============================================================

export const pricing = {
  ctx: null,
  _bound: false,
  _pollTimer: null,
  _pollBusy: false,

  // 🔧 Ajuste aqui
  HOTMART_CHECKOUTS: {
    monthly: "https://pay.hotmart.com/I104401854N", // você mandou este
    quarterly: "https://pay.hotmart.com/I104401854N", // (troque quando tiver)
    lifetime: "https://pay.hotmart.com/I104401854N" // (troque quando tiver)
  },

  init(ctx) {
    this.ctx = ctx;

    // eventos canônicos
    window.addEventListener("liora:open-pricing", () => this.render());
    window.addEventListener("liora:open-plans", () => this.render()); // compat antigo
    window.addEventListener("liora:user-changed", () => this.render());

    // se voltar do checkout, tenta detectar premium
    window.addEventListener("focus", () => this._maybeRefreshPremium("focus"));

    this.bindOnce();
    this.render();

    console.log("💳 pricing.js iniciado (v1.5)");
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

  // tenta ler premium do gates (recomendado) ou do store
  isPremium() {
    try {
      // padrão novo: gates.isPremium(store)
      if (this.ctx?.gates?.isPremium) return !!this.ctx.gates.isPremium(this.ctx?.store);
      // compat: gates.isPremium() (sem args)
      if (this.ctx?.gates?.isPremium?.length === 0) return !!this.ctx.gates.isPremium();
    } catch {}
    const u = this.getUser();
    return !!u?.premium;
  },

  // usado só como fallback se algo der ruim (não é o fluxo principal)
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

    window.dispatchEvent(new Event("liora:user-changed"));
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
    window.dispatchEvent(
      new CustomEvent("liora:premium-changed", { detail: { premium: !!on, ...meta } })
    );
  },

  // -----------------------------
  // Render (não sobrescreve HTML)
  // -----------------------------
  render() {
    const screen = document.getElementById("screen-pricing");
    if (!screen) return;

    const premium = this.isPremium();

    screen.querySelectorAll('[data-action="pricingChoose"]').forEach((btn) => {
      const raw = (btn.getAttribute("data-plan") || "").trim().toLowerCase();
      const plan = raw === "premium" ? "monthly" : raw;
      const isFree = plan === "free";

      // premium ativo: desabilita compras
      if (!isFree && premium) {
        btn.disabled = true;
        btn.classList.add("is-disabled");
        btn.setAttribute("title", "Premium já está ativo");
      } else {
        btn.disabled = false;
        btn.classList.remove("is-disabled");
        btn.removeAttribute("title");
      }

      if (isFree) {
        btn.textContent = premium ? "Continuar (Premium ativo)" : "Continuar no Free";
      }
    });

    // opcional: marca visual de plano atual, se seu HTML usar data-plan-badge
    screen.querySelectorAll("[data-plan-badge]").forEach((el) => {
      const p = (el.getAttribute("data-plan-badge") || "").toLowerCase();
      el.classList.toggle("active", premium && p !== "free");
    });
  },

  // -----------------------------
  // Clicks
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
        this.toast("Premium libera limites maiores, insights e revisão guiada.");
        return;
      }

      if (act !== "pricingChoose") return;

      const raw = (btn.getAttribute("data-plan") || "free").trim().toLowerCase();
      const plan = raw === "premium" ? "monthly" : raw;

      // Free
      if (plan === "free") {
        this.toast(this.isPremium() ? "Premium já está ativo." : "Ok. Você está no Free.");
        this.nav("home");
        return;
      }

      // Login obrigatório (se você quiser comprar sempre logado)
      // Obs: se preferir deixar comprar sem login, remova este bloco.
      try {
        if (this.ctx?.gates?.requireLogin) {
          const ok = this.ctx.gates.requireLogin();
          if (!ok) return;
        }
      } catch {}

      // Já é premium
      if (this.isPremium()) {
        this.toast("Premium já está ativo.");
        this.nav("dashboard");
        return;
      }

      // 🔥 Fluxo Hotmart: abre checkout + acompanha (poll)
      this._startCheckout(plan);
    });
  },

  // -----------------------------
  // Hotmart flow
  // -----------------------------
  _checkoutUrl(plan) {
    return this.HOTMART_CHECKOUTS?.[plan] || this.HOTMART_CHECKOUTS?.monthly || "";
  },

  _startCheckout(plan) {
    const url = this._checkoutUrl(plan);
    if (!url) {
      this.toast("Checkout não configurado para este plano.");
      return;
    }

    // dica clara pra usuária
    this.toast("Abrindo checkout… Após pagar, volte para esta aba para liberar o Premium.");

    // abre em nova aba (melhor UX)
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // fallback: navega na mesma aba
      location.href = url;
      return;
    }

    // inicia watcher
    this._startPremiumWatcher({ plan, source: "hotmart" });
  },

  async _maybeRefreshPremium(reason = "manual") {
    // se já é premium, não gasta request
    if (this.isPremium()) return;

    // tenta 2 caminhos:
    // A) ctx.auth.refreshProfile (se existir)
    // B) chama /api/consume-pending com JWT do supabase
    try {
      const a = this.ctx?.auth || window.auth || null;

      // A) refreshProfile
      if (a?.refreshProfile) {
        const r = await a.refreshProfile(this.ctx);
        if (r?.ok && r?.premium) {
          this.toast("Premium liberado ✅");
          this.nav("dashboard");
          return;
        }
      }

      // B) consume-pending (server)
      await this._consumePendingServer();
      // depois do consume, pede refreshProfile (ou re-render) de novo
      if (a?.refreshProfile) {
        const r2 = await a.refreshProfile(this.ctx);
        if (r2?.ok && r2?.premium) {
          this.toast("Premium liberado ✅");
          this.nav("dashboard");
          return;
        }
      }

      // se não liberou, apenas re-render (mantém coerente)
      this.render();
    } catch (e) {
      console.warn("⚠️ refresh premium falhou:", reason, e);
    }
  },

  async _consumePendingServer() {
    // depende do supabase client para pegar access_token
    const a = this.ctx?.auth || window.auth || null;
    const sb = a?.sb || null;

    if (!sb?.auth?.getSession) return { ok: false, error: "no_supabase_client" };

    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token || "";
    if (!token) return { ok: false, error: "no_access_token" };

    const resp = await fetch("/api/consume-pending", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      // opcional: ajuda no anti-abuso (email_mismatch)
      body: JSON.stringify({ email: (a?.user?.email || "").trim().toLowerCase() })
    });

    const text = await resp.text();
    let dataJson = null;
    try {
      dataJson = JSON.parse(text);
    } catch {
      dataJson = { ok: false, error: "bad_json", raw: text };
    }

    return dataJson;
  },

  _startPremiumWatcher(meta = {}) {
    this._stopPremiumWatcher();

    // tenta rápido por ~2 min: 6 tentativas, 20s
    const maxTries = 6;
    let tries = 0;

    const tick = async () => {
      if (this._pollBusy) return;
      this._pollBusy = true;

      try {
        tries += 1;

        // tenta liberar
        await this._maybeRefreshPremium(`watch_${tries}`);

        // se virou premium, encerra
        if (this.isPremium()) {
          this._stopPremiumWatcher();
          return;
        }

        // continua até acabar
        if (tries >= maxTries) {
          this._stopPremiumWatcher();
          this.toast("Se o Premium não liberou ainda, aguarde 1-2 min e clique em “Já paguei” (ou faça login novamente).");
          return;
        }
      } finally {
        this._pollBusy = false;
      }
    };

    // primeira tentativa já
    tick();

    this._pollTimer = setInterval(tick, 20000);
  },

  _stopPremiumWatcher() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this._pollBusy = false;
  },

  // -----------------------------
  // Nav / UI
  // -----------------------------
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
      return;
    } catch {}
    console.log("🔔", msg);
  }
};
