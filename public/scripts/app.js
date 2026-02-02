// ==========================================================
// 🟢 LIORA — app.js (Deluxe-ready)
// - Router Deluxe (hash/deep-link + eventos open-*)
// - Theme toggle + persist
// - Auth mock via user.js + eventos canônicos
// - Nav inteligente (allowlist) + “em breve” só fora da allowlist
// - Refresh do dashboard quando user muda
// ==========================================================

import { router } from "./router.js";
import { store } from "./store.js";
import { gates } from "./gates.js";
import { ui } from "./ui.js";
import { user } from "./user.js";

import { planos } from "./features/planos.js";
import { pdf } from "./features/pdf.js";
import { simulados } from "./features/simulados.js";
import { dashboard } from "./features/dashboard.js";

console.log("🟢 Liora Projeto Zero — app.js carregado");

// ----------------------------------------------------------
// THEME
// ----------------------------------------------------------
function setupTheme() {
  const btn = document.getElementById("btn-theme");

  function apply(th) {
    const theme = th === "light" ? "light" : "dark";
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.classList.toggle("dark", theme === "dark");
    store.set("theme", theme);
  }

  const saved = store.get("theme") || "dark";
  apply(saved);

  btn?.addEventListener("click", () => {
    const isLight = document.documentElement.classList.contains("light");
    apply(isLight ? "dark" : "light");
  });

  console.log("🌗 Tema ligado");
}

// ----------------------------------------------------------
// AUTH MOCK (via user.js)
// ----------------------------------------------------------
function setupAuthMock() {
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");

  function setLogged(isLogged) {
    btnLogin?.classList.toggle("hidden", isLogged);
    btnLogout?.classList.toggle("hidden", !isLogged);
  }

  // estado inicial
  const u = user.get(store);
  setLogged(!!u);

  btnLogin?.addEventListener("click", () => {
    user.set(store, { name: "Patricia", premium: false });
    setLogged(true);
    ui.toast("✅ Login mock (premium=false)");
    window.dispatchEvent(new Event("liora:user-changed"));
  });

  btnLogout?.addEventListener("click", () => {
    user.clear(store);
    setLogged(false);
    ui.toast("✅ Logout");
    window.dispatchEvent(new Event("liora:user-changed"));
  });
}

// ----------------------------------------------------------
// NAV
// ----------------------------------------------------------
function setupNav() {
  const ALWAYS_ALLOWED = new Set(["home", "tema", "pdf", "simulados", "dashboard"]);

  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      const to = String(el.getAttribute("data-nav") || "").trim().toLowerCase();
      if (!to) return;

      // bloqueia "em breve" somente se NÃO estiver na allowlist
      const isSoon = el.getAttribute("data-soon") === "1";
      const pill = el.querySelector(".pill");
      const pillText = (pill?.innerText || "").toLowerCase().trim();
      const pillSaysSoon = pillText.includes("em breve");

      if (!ALWAYS_ALLOWED.has(to) && (isSoon || pillSaysSoon)) {
        ev.preventDefault();
        ui.toast?.("🧪 Em breve! Estamos fechando Tema primeiro 🙂");
        return;
      }

      // evita scroll/topo estranho em links
      ev.preventDefault();

      router.go(to);
    });
  });
}

// ----------------------------------------------------------
// BOOT
// ----------------------------------------------------------
function boot() {
  // ✅ Router Deluxe: hash + deep-link
  router.init({ useHash: true, defaultRoute: "home" });

  setupTheme();
  setupAuthMock();
  setupNav();

  // expõe helpers pro console
  user.installWindow(store);

  // init features
  const ctx = { router, store, gates, ui };

  planos.init(ctx);
  pdf.init(ctx);
  simulados.init(ctx);
  dashboard.init(ctx);

  // quando usuário mudar (login/logout/premium): refresca dashboard
  window.addEventListener("liora:user-changed", () => {
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  });

  // debug opcional (rota mudou)
  window.addEventListener("liora:route-changed", (e) => {
    // console.log("🔁 route-changed:", e?.detail?.route);
  });

  console.log("✅ Projeto Zero pronto");
}

document.addEventListener("DOMContentLoaded", boot);
