// app.js — LIORA Projeto Zero (de luxe + reload-proof)
// ✔ boot robusto
// ✔ tema dark/light persistido
// ✔ auth mock (login/logout) + evento canonical
// ✔ navegação por delegação (data-nav)
// ✔ bloqueio de rotas "em breve"
// ✔ init de features + refresh quando rota vira dashboard

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

function setupAuthMock() {
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");

  function setLogged(isLogged) {
    btnLogin?.classList.toggle("hidden", isLogged);
    btnLogout?.classList.toggle("hidden", !isLogged);
  }

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

function setupNav() {
  document.addEventListener("click", (ev) => {
    const el = ev.target?.closest?.("[data-nav]");
    if (!el) return;

    const to = (el.getAttribute("data-nav") || "").trim();
    if (!to) return;

    // se for <a>, evita navegação do browser
    if (el.tagName === "A") ev.preventDefault();

    // bloqueio "em breve"
    const isSoon = el.getAttribute("data-soon") === "1";
    const pill = el.querySelector?.(".pill");
    const pillText = (pill?.innerText || "").toLowerCase().trim();
    const pillSaysSoon = pillText.includes("em breve");

    if (isSoon || pillSaysSoon) {
      ev.preventDefault();
      ui.toast?.("🧪 Em breve! Estamos fechando Tema primeiro 🙂");
      return;
    }

    router.go(to, { pushHash: true });

    try { window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch { window.scrollTo(0, 0); }
  });
}

function boot() {
  router.init();

  setupTheme();
  setupAuthMock();
  setupNav();

  // helpers no console
  user.installWindow(store);

  // init features
  const ctx = { router, store, gates, ui };

  try { planos.init(ctx); } catch (e) { console.warn("⚠️ planos.init falhou:", e); }
  try { pdf.init(ctx); } catch (e) { console.warn("⚠️ pdf.init falhou:", e); }
  try { simulados.init(ctx); } catch (e) { console.warn("⚠️ simulados.init falhou:", e); }
  try { dashboard.init(ctx); } catch (e) { console.warn("⚠️ dashboard.init falhou:", e); }

  // user change -> refresh dashboard
  window.addEventListener("liora:user-changed", () => {
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  });

  // ✅ sempre que trocar rota para dashboard, refresca
  window.addEventListener("liora:route-changed", (ev) => {
    const route = ev?.detail?.route;
    if (route === "dashboard") {
      window.dispatchEvent(new Event("liora:dashboard-refresh"));
    }
  });

  // ✅ rota inicial (hash) só depois das features iniciarem
  const initial = router.getInitialRoute();
  router.go(initial, { pushHash: false });

  // ✅ garantia extra no primeiro load do dashboard
  if (initial === "dashboard") {
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  }

  console.log("✅ Projeto Zero pronto");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
