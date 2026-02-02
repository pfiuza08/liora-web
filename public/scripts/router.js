// router.js — v2 (de luxe)
// ✔ troca telas
// ✔ marca [data-nav] ativo
// ✔ marca card-btn ativo (home) quando existir
// ✔ aria-current="page" para acessibilidade
// ✔ opcional: suporta #rota na URL (sem quebrar nada)

export const router = {
  screens: ["home", "tema", "pdf", "simulados", "dashboard"],
  current: "home",

  init() {
    // ✅ se tiver hash, tenta abrir nele
    const fromHash = this._routeFromHash();
    if (fromHash) this.go(fromHash, { silentHash: true });

    // ✅ se usuário mudar o hash manualmente
    window.addEventListener("hashchange", () => {
      const r = this._routeFromHash();
      if (r) this.go(r, { silentHash: true });
    });
  },

  go(route, opts = {}) {
    const { silentHash = false } = opts;

    if (!this.screens.includes(route)) route = "home";
    this.current = route;

    // 1) telas
    this.screens.forEach((r) => {
      const el = document.getElementById(`screen-${r}`);
      if (!el) return;
      el.classList.toggle("active", r === route);
    });

    // 2) marca nav ativo (header, menu, qualquer coisa com data-nav)
    this._markNavActive(route);

    // 3) atualiza hash (opcional)
    if (!silentHash) this._setHash(route);

    console.log("🧭 Router →", route);
  },

  // -----------------------------
  // Helpers
  // -----------------------------
  _markNavActive(route) {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      const to = el.getAttribute("data-nav");
      const isActive = to === route;

      // classe visual (seu CSS já tem [data-nav].is-active e card-btn.is-active)
      el.classList.toggle("is-active", isActive);
      el.classList.toggle("is-active", isActive); // redundante ok, mantém compat

      // ✅ se for card da home (card-btn), também marca
      if (el.classList.contains("card-btn")) {
        el.classList.toggle("is-active", isActive);
      }

      // acessibilidade
      if (isActive) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  },

  _routeFromHash() {
    const raw = String(location.hash || "").replace("#", "").trim();
    if (!raw) return null;
    const r = raw.toLowerCase();
    return this.screens.includes(r) ? r : null;
  },

  _setHash(route) {
    // evita scroll jump (alguns browsers fazem isso com hash)
    const newHash = `#${route}`;
    if (location.hash === newHash) return;
    history.replaceState(null, "", newHash);
  }
};
