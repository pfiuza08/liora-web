// router.js — v3 (hash + nav ativo + evento canônico + telas)
// Inclui: home, tema, pdf, simulados, dashboard, pricing

export const router = {
  screens: ["home", "tema", "pdf", "simulados", "dashboard", "pricing"],

  init() {
    // aplica rota inicial
    const r0 = this.getInitialRoute();
    this.go(r0, { pushHash: false });

    // reage a mudanças de hash (ex: /#dashboard)
    window.addEventListener("hashchange", () => {
      const r = this.getInitialRoute();
      this.go(r, { pushHash: false });
    });

    // suporte a botões [data-nav]
    document.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-nav]");
      if (!el) return;

      const to = (el.getAttribute("data-nav") || "").trim().toLowerCase();
      if (!to) return;

      this.go(to);
    });

    // suporte a navegação por evento (para módulos)
    window.addEventListener("liora:nav", (ev) => {
      const to = (ev?.detail?.to || "").trim().toLowerCase();
      if (!to) return;
      this.go(to);
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

  dispatchRouteEvents(route) {
    // ✅ evento canônico geral
    window.dispatchEvent(new CustomEvent("liora:route-changed", { detail: { route } }));

    // ✅ eventos por tela (para manter compat com seu app atual)
    if (route === "simulados") {
      window.dispatchEvent(new Event("liora:open-simulados"));
      return;
    }

    if (route === "dashboard") {
      window.dispatchEvent(new Event("liora:open-dashboard"));
      window.dispatchEvent(new Event("liora:dashboard-refresh"));
      return;
    }

    if (route === "pricing") {
      window.dispatchEvent(new Event("liora:open-pricing"));
      return;
    }

    if (route === "tema") {
      window.dispatchEvent(new Event("liora:open-tema"));
      return;
    }

    if (route === "pdf") {
      window.dispatchEvent(new Event("liora:open-pdf"));
      return;
    }

    if (route === "home") {
      window.dispatchEvent(new Event("liora:open-home"));
      return;
    }
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
      if (location.hash !== next) {
        history.pushState(null, "", next);
        // como pushState não dispara hashchange em todo browser, garantimos a execução:
        this.dispatchRouteEvents(r);
      } else {
        this.dispatchRouteEvents(r);
      }
    } else {
      this.dispatchRouteEvents(r);
    }

    console.log("🧭 Router →", r);
  }
};
