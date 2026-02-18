// router.js — v4 (hash + nav ativo + clique [data-nav] + eventos canônicos)
export const router = {
 // router.js
    screens: ["home", "tema", "pdf", "simulados", "dashboard", "pricing", "thanks"],

    // ✅ clique em qualquer [data-nav] em qualquer lugar da UI
    document.addEventListener("click", (ev) => {
      const el = ev.target.closest("[data-nav]");
      if (!el) return;

      const to = (el.getAttribute("data-nav") || "").trim().toLowerCase();
      if (!to) return;

      this.go(to);
    });

    // reage ao hash
    window.addEventListener("hashchange", () => {
      const r = this.getInitialRoute();
      this.go(r, { pushHash: false });
    });

    // aplica rota inicial
    this.go(this.getInitialRoute(), { pushHash: false });
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

  emitOpenEvent(route) {
    window.dispatchEvent(new CustomEvent("liora:route-changed", { detail: { route } }));

    if (route === "simulados") window.dispatchEvent(new Event("liora:open-simulados"));
    if (route === "dashboard") {
      window.dispatchEvent(new Event("liora:open-dashboard"));
      window.dispatchEvent(new Event("liora:dashboard-refresh"));
    }
    if (route === "tema") window.dispatchEvent(new Event("liora:open-tema"));
    if (route === "pdf") window.dispatchEvent(new Event("liora:open-pdf"));
    if (route === "home") window.dispatchEvent(new Event("liora:open-home"));
    if (route === "pricing") window.dispatchEvent(new Event("liora:open-pricing"));
  },

  go(route, opts = {}) {
    const { pushHash = true } = opts;
    const r = this.normalize(route);

    this.setActiveScreen(r);
    this.setActiveNav(r);

    if (pushHash) {
      const next = `#${r}`;
      if (location.hash !== next) history.pushState(null, "", next);
    }

    this.emitOpenEvent(r);
    console.log("🧭 Router →", r);
  }
};
