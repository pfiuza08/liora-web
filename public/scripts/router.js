// router.js — v3 (hash + nav ativo + eventos canônicos por tela)
export const router = {
  screens: ["home", "tema", "pdf", "simulados", "dashboard", "pricing"],

  init() {
    // reage a mudanças de hash (ex: /#dashboard)
    window.addEventListener("hashchange", () => {
      const r = this.getInitialRoute();
      this.go(r, { pushHash: false });
    });

    // aplica rota inicial ao carregar
    const r0 = this.getInitialRoute();
    this.go(r0, { pushHash: false });
  },

  normalize(route) {
    const r = String(route || "").trim().toLowerCase();
    return this.screens.includes(r) ? r : "home";
  },

  getInitialRoute() {
    const h = (location.hash || "").replace("#", "").trim().toLowerCase();
    return this.normalize(h || "home");
  },

  setActiveScreen(route) {
    this.screens.forEach((r) => {
      const el = document.getElementById(`screen-${r}`);
      if (!el) return;
      el.classList.toggle("active", r === route);
    });
  },

  setActiveNav(route) {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      const to = (el.getAttribute("data-nav") || "").trim().toLowerCase();
      const active = to === route;

      el.classList.toggle("is-active", active);
      if (active) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  },

  // ✅ dispara eventos canônicos que cada feature já escuta
  emitOpenEvent(route) {
    // evento genérico (útil p/ debug)
    window.dispatchEvent(new CustomEvent("liora:route-changed", { detail: { route } }));

    // eventos por tela (o que suas features esperam)
    if (route === "simulados") window.dispatchEvent(new Event("liora:open-simulados"));
    if (route === "dashboard") {
      window.dispatchEvent(new Event("liora:open-dashboard"));
      window.dispatchEvent(new Event("liora:dashboard-refresh"));
    }
    if (route === "tema") window.dispatchEvent(new Event("liora:open-tema"));
    if (route === "pdf") window.dispatchEvent(new Event("liora:open-pdf"));
    if (route === "home") window.dispatchEvent(new Event("liora:open-home"));

    // ⭐ o que estava faltando:
    if (route === "pricing") window.dispatchEvent(new Event("liora:open-pricing"));
  },

  go(route, opts = {}) {
    const { pushHash = true } = opts;
    const r = this.normalize(route);

    // troca tela
    this.setActiveScreen(r);

    // marca nav ativo
    this.setActiveNav(r);

    // atualiza URL (sem recarregar)
    if (pushHash) {
      const next = `#${r}`;
      if (location.hash !== next) history.pushState(null, "", next);
    }

    // ✅ eventos canônicos
    this.emitOpenEvent(r);

    console.log("🧭 Router →", r);
  }
};
