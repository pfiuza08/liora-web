import { router } from "./router.js";
import { store } from "./store.js";
import { gates } from "./gates.js";
import { ui } from "./ui.js";

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
  // ✅ Por enquanto é “mock simples”
  // depois plugamos Firebase/Auth do jeito certo
  const btnLogin = document.getElementById("btn-login");
  const btnLogout = document.getElementById("btn-logout");

  function setLogged(isLogged) {
    btnLogin?.classList.toggle("hidden", isLogged);
    btnLogout?.classList.toggle("hidden", !isLogged);
  }

  const user = store.get("user") || null;
  setLogged(!!user);

  btnLogin?.addEventListener("click", () => {
    // mock login
    store.set("user", { name: "Patricia", premium: false });
    setLogged(true);
    ui.toast("✅ Login mock ativado (user premium=false)");
  });

  btnLogout?.addEventListener("click", () => {
    store.remove("user");
    setLogged(false);
    ui.toast("✅ Logout");
  });
}

function setupNav() {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (ev) => {
      const to = el.getAttribute("data-nav");
      if (!to) return;

      // ✅ EXCEÇÕES: estes dois já estão funcionais e não devem ser bloqueados
      if (to === "simulados") {
        ev.preventDefault();
        window.dispatchEvent(new Event("liora:open-simulados"));
        return;
      }

      if (to === "dashboard") {
        ev.preventDefault();
        window.dispatchEvent(new Event("liora:open-dashboard"));
        return;
      }

      // ✅ Bloqueia apenas quando o item estiver marcado como "em breve"
      // Regras:
      // 1) se tiver data-soon="1" -> bloqueia
      // 2) se a pill existir E tiver texto "em breve" -> bloqueia
      const isSoon = el.getAttribute("data-soon") === "1";
      const pill = el.querySelector(".pill");
      const pillText = (pill?.innerText || "").toLowerCase().trim();
      const pillSaysSoon = pillText.includes("em breve");

      if (isSoon || pillSaysSoon) {
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

  planos.init({ router, store, gates, ui });
  pdf.init({ router, store, gates, ui });
  simulados.init({ router, store, gates, ui });
  dashboard.init({ router, store, gates, ui });

  // rota inicial
  router.go("home");

  console.log("✅ Projeto Zero pronto");
}

document.addEventListener("DOMContentLoaded", boot);
