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
    document.documentElement.classList.toggle("light", th === "light");
    document.documentElement.classList.toggle("dark", th === "dark");
    store.set("theme", th);
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

function setupNav() {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      const to = el.getAttribute("data-nav");
      if (!to) return;

      // ✅ rotas sempre liberadas
      const ALWAYS_ALLOWED = new Set(["home", "tema", "pdf", "simulados", "dashboard"]);

      // ✅ só bloqueia "em breve" se NÃO estiver na allowlist
      const isSoon = el.getAttribute("data-soon") === "1";
      const pill = el.querySelector(".pill");
      const pillText = (pill?.innerText || "").toLowerCase().trim();
      const pillSaysSoon = pillText.includes("em breve");

      if (!ALWAYS_ALLOWED.has(to) && (isSoon || pillSaysSoon)) {
        ev.preventDefault();
        ui.toast?.("🧪 Em breve! Estamos fechando Tema primeiro 🙂");
        return;
      }

      router.go(to);
    });
  });
}


function boot() {
  router.init();
  setupTheme();
  setupAuthMock();
  setupNav();

  // expõe helpers pro console
  user.installWindow(store);

  planos.init({ router, store, gates, ui });
  pdf.init({ router, store, gates, ui });
  simulados.init({ router, store, gates, ui });
  dashboard.init({ router, store, gates, ui });

  // quando usuário mudar (login/logout/premium): refresca dashboard
  window.addEventListener("liora:user-changed", () => {
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  });

  router.go("home");
  console.log("✅ Projeto Zero pronto");
}

document.addEventListener("DOMContentLoaded", boot);
