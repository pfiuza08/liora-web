export const router = {
  screens: ["home", "tema", "pdf", "simulados", "dashboard"],
  current: null,
  _inited: false,

  // -----------------------------
  // INIT
  // -----------------------------
  init({ useHash = true } = {}) {
    if (this._inited) return;
    this._inited = true;

    this.useHash = !!useHash;

    // back/forward + hash change
    const onNav = () => {
      const r = this.useHash ? this._readHash() : this._readPath();
      this.go(r, { silentUrl: true });
    };

    window.addEventListener("hashchange", onNav);
    window.addEventListener("popstate", onNav);

    // rota inicial
    const initial = this.useHash ? this._readHash() : this._readPath();
    this.go(initial, { silentUrl: true, force: true });

    console.log("🧭 Router init ok →", this.current);
  },

  // -----------------------------
  // NAV
  // -----------------------------
  go(route, opts = {}) {
    const { silentUrl = false, force = false } = opts;

    if (!this.screens.includes(route)) route = "home";

    // evita “re-tocar a mesma música”
    if (!force && this.current === route) {
      // ainda assim dispara um ping (útil pra "refresh manual")
      this._after(route, { reason: "same-route" });
      return;
    }

    this.current = route;

    // aplica classes
    this.screens.forEach((r) => {
      const el = document.getElementById(`screen-${r}`);
      if (!el) return;
      el.classList.toggle("active", r === route);
    });

    // atualiza URL (sem recarregar)
    if (!silentUrl) {
      this.useHash ? this._writeHash(route) : this._writePath(route);
    }

    console.log("🧭 Router →", route);

    // pós-navegação
    this._after(route, { reason: "go" });
  },

  refresh() {
    if (!this.current) return;
    this._after(this.current, { reason: "refresh" });
  },

  // -----------------------------
  // HOOKS
  // -----------------------------
  _after(route, meta = {}) {
    // garante que o DOM já alternou de tela
    requestAnimationFrame(() => {
      // evento global (útil pra analytics/telemetria)
      window.dispatchEvent(new CustomEvent("liora:route", { detail: { route, ...meta } }));

      // hooks específicos por rota
      if (route === "dashboard") {
        window.dispatchEvent(new Event("liora:open-dashboard"));
      }

      if (route === "simulados") {
        window.dispatchEvent(new Event("liora:open-simulados"));
      }

      // Se um dia quiser “auto-render” de outras telas:
      // if (route === "tema") window.dispatchEvent(new Event("liora:open-tema"));
      // if (route === "pdf") window.dispatchEvent(new Event("liora:open-pdf"));
    });
  },

  // -----------------------------
  // URL HELPERS
  // -----------------------------
  _readHash() {
    const h = (location.hash || "").replace("#", "").trim();
    return h || "home";
  },

  _writeHash(route) {
    const next = `#${route}`;
    if (location.hash !== next) location.hash = next;
  },

  // (opcional) path mode, se você quiser no futuro: /dashboard
  _readPath() {
    const p = (location.pathname || "/").replace("/", "").trim();
    return p || "home";
  },

  _writePath(route) {
    const url = route === "home" ? "/" : `/${route}`;
    history.pushState({}, "", url);
  }
};
