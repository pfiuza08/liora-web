// router.js — v2 (hash + nav ativo + evento canônico)
export const router = {
  screens: ["home", "tema", "pdf", "simulados", "dashboard"],

  init() {
    // reage a mudanças de hash (ex: /#dashboard)
    window.addEventListener("hashchange", () => {
      const r = this.getInitialRoute();
      this.go(r, { pushHash: false });
    });
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
    // marca qualquer elemento com data-nav
    document.querySelectorAll("[data-nav]").forEach((el) => {
      const to = (el.getAttribute("data-nav") || "").trim().toLowerCase();
      const active = to === route;

      el.classList.toggle("is-active", active);
      if (active) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
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

    // ✅ evento canônico para features reagirem
    window.dispatchEvent(new CustomEvent("liora:route-changed", { detail: { route: r } }));

    console.log("🧭 Router →", r);
  }
};
