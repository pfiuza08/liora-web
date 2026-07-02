// router.js — v5.0 (login obrigatório para uso das funcionalidades)
import { hasAuthenticatedSession, requestLogin } from "./api-auth-fetch.js";

export const router = {
  screens: ["home", "tema", "pdf", "simulados", "dashboard", "pricing"],
  protectedScreens: new Set(["tema", "pdf", "simulados", "dashboard"]),

  init: function () {
    var self = this;

    // clique em qualquer [data-nav]
    document.addEventListener("click", function (ev) {
      var t = ev && ev.target ? ev.target : null;
      if (!t) return;

      var el = t.closest ? t.closest("[data-nav]") : null;
      if (!el) return;

      var to = (el.getAttribute("data-nav") || "").trim().toLowerCase();
      if (!to) return;

      self.go(to);
    });

    // reage ao hash
    window.addEventListener("hashchange", function () {
      var r = self.getInitialRoute();
      self.go(r, { pushHash: false });
    });

    // aplica rota inicial
    self.go(self.getInitialRoute(), { pushHash: false });
  },

  normalize: function (route) {
    var r = String(route || "").trim().toLowerCase();
    return this.screens.indexOf(r) >= 0 ? r : "home";
  },

  getInitialRoute: function () {
    var h = String(location.hash || "").replace("#", "").trim().toLowerCase();
    return this.normalize(h || "home");
  },

  requiresLogin: function (route) {
    return this.protectedScreens.has(String(route || "").trim().toLowerCase());
  },

  setActiveScreen: function (route) {
    for (var i = 0; i < this.screens.length; i++) {
      var r = this.screens[i];
      var el = document.getElementById("screen-" + r);
      if (!el) continue;
      if (r === route) el.classList.add("active");
      else el.classList.remove("active");
    }
  },

  setActiveNav: function (route) {
    var nodes = document.querySelectorAll("[data-nav]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var to = (el.getAttribute("data-nav") || "").trim().toLowerCase();
      var active = to === route;

      if (active) {
        el.classList.add("is-active");
        el.setAttribute("aria-current", "page");
      } else {
        el.classList.remove("is-active");
        el.removeAttribute("aria-current");
      }
    }
  },

  emitOpenEvent: function (route) {
    window.dispatchEvent(new CustomEvent("liora:route-changed", { detail: { route: route } }));

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

  go: function (route, opts) {
    opts = opts || {};
    var pushHash = opts.pushHash !== false;

    var r = this.normalize(route);

    if (this.requiresLogin(r) && !hasAuthenticatedSession()) {
      requestLogin(r);
      r = "home";
    }

    this.setActiveScreen(r);
    this.setActiveNav(r);

    var next = "#" + r;
    if (pushHash) {
      if (location.hash !== next) history.pushState(null, "", next);
    } else if (location.hash !== next) {
      history.replaceState(null, "", next);
    }

    this.emitOpenEvent(r);
    console.log("🧭 Router →", r);
  }
};
