// ==========================================================
// 🧭 LIORA — ROUTER (Deluxe)
// - Hash routing (#home, #dashboard, etc.)
// - Deep-link (recarrega e volta na mesma tela)
// - Dispara eventos canônicos por tela (open-*)
// - Evita loops (hashchange -> go -> hashchange)
// ==========================================================

export const router = {
  screens: ["home", "tema", "pdf", "simulados", "dashboard"],

  _inited: false,
  _useHash: true,
  _defaultRoute: "home",
  _current: null,

  init({ useHash = true, defaultRoute = "home" } = {}) {
    if (this._inited) return;
    this._inited = true;

    this._useHash = !!useHash;
    this._defaultRoute = this.screens.includes(defaultRoute) ? defaultRoute : "home";

    const onLocationChange = () => {
      const r = this._readRouteFromLocation() || this._defaultRoute;
      this.go(r, { fromLocation: true, replace: true });
    };

    if (this._useHash) {
      window.addEventListener("hashchange", onLocationChange);
    } else {
      window.addEventListener("popstate", onLocationChange);
    }

    // rota inicial (hash ou default)
    onLocationChange();
  },

  current() {
    return this._current || this._defaultRoute;
  },

  go(route, opts = {}) {
    const {
      fromLocation = false, // veio do hashchange/popstate
      replace = false,      // replace hash/pushstate
      force = false         // re-render mesmo se já está na rota
    } = opts;

    // normaliza + valida
    route = String(route || "").trim().toLowerCase();
    if (!this.screens.includes(route)) route = this._defaultRoute;

    // atualiza URL (se a navegação foi interna)
    if (this._useHash && !fromLocation) {
      const target = `#${route}`;
      if (location.hash !== target) {
        if (replace) location.replace(target);
        else location.hash = target;
      }
    }

    // evita render redundante
    if (!force && this._current === route) {
      // mesmo assim, dispara o evento canônico para garantir re-render quando precisar
      this._dispatchRoute(route);
      return;
    }

    // ativa tela
    this.screens.forEach((r) => {
      const el = document.getElementById(`screen-${r}`);
      if (!el) return;
      el.classList.toggle("active", r === route);
    });

    this._current = route;

    console.log("🧭 Router →", route);

    // evento global (útil pra debug/telemetria)
    window.dispatchEvent(new CustomEvent("liora:route-changed", { detail: { route } }));

    // eventos canônicos por tela
    this._dispatchRoute(route);
  },

  // ----------------------------------------------------------
  // Internals
  // ----------------------------------------------------------
  _readRouteFromLocation() {
    if (this._useHash) {
      // suporta: #dashboard, #/dashboard, etc.
      const h = String(location.hash || "")
        .replace(/^#\/?/, "")
        .trim()
        .toLowerCase();

      if (!h) return null;

      // permite hashes com extras (ex: #dashboard?x=1) sem quebrar
      const clean = h.split("?")[0].split("&")[0];
      return clean || null;
    }

    // (fallback opcional) path routing:
    // /dashboard -> "dashboard"
    const p = String(location.pathname || "/").replace(/^\/+/, "").toLowerCase();
    const first = p.split("/")[0];
    return first || null;
  },

  _dispatchRoute(route) {
    // “open-*” mantém compatibilidade com seu padrão atual
    switch (route) {
      case "dashboard":
        window.dispatchEvent(new Event("liora:open-dashboard"));
        break;
      case "simulados":
        window.dispatchEvent(new Event("liora:open-simulados"));
        break;
      case "tema":
        window.dispatchEvent(new Event("liora:open-tema"));
        break;
      case "pdf":
        window.dispatchEvent(new Event("liora:open-pdf"));
        break;
      default:
        window.dispatchEvent(new Event("liora:open-home"));
        break;
    }
  }
};
