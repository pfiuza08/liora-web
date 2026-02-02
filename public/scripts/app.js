// =============================================================
// 🧠 LIORA — APP (Router + Boot + Nav + Theme + Gates)
// Versão: v84-FREEMIUM-MVP (robusto)
// -------------------------------------------------------------
// ✔ Router por hash (#home, #tema, #pdf, #simulados, #dashboard)
// ✔ Nav por [data-nav] e marca ativo (is-active)
// ✔ Theme toggle (html.light / html.dark)
// ✔ Store (localStorage) + UI helpers (toast/error simples)
// ✔ Gates (login/premium) via eventos canônicos
// ✔ Boot com imports dinâmicos (não quebra se faltar módulo)
// ✔ Integra Premium Modal (premium.js)
// =============================================================

/* -----------------------------
   STORE (localStorage)
----------------------------- */
function createStore(prefix = "liora:") {
  const key = (k) => `${prefix}${k}`;

  return {
    get(k) {
      try {
        const raw = localStorage.getItem(key(k));
        if (!raw) return null;
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(key(k), JSON.stringify(v));
      } catch (e) {
        console.warn("⚠️ store.set falhou:", e);
      }
    },
    remove(k) {
      try {
        localStorage.removeItem(key(k));
      } catch {}
    }
  };
}

/* -----------------------------
   UI (toast + error simples)
----------------------------- */
function createUI() {
  const toastElId = "liora-toast";

  function ensureToast() {
    let el = document.getElementById(toastElId);
    if (el) return el;

    el = document.createElement("div");
    el.id = toastElId;
    el.style.position = "fixed";
    el.style.left = "50%";
    el.style.bottom = "18px";
    el.style.transform = "translateX(-50%)";
    el.style.zIndex = "999999";
    el.style.maxWidth = "92vw";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "14px";
    el.style.border = "1px solid rgba(255,255,255,.14)";
    el.style.background = "rgba(20,20,24,.92)";
    el.style.color = "rgba(255,255,255,.92)";
    el.style.boxShadow = "0 14px 50px rgba(0,0,0,.40)";
    el.style.backdropFilter = "blur(10px)";
    el.style.webkitBackdropFilter = "blur(10px)";
    el.style.fontWeight = "700";
    el.style.fontSize = "13px";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    el.style.transition = "opacity .18s ease, transform .18s ease";
    el.style.transform = "translateX(-50%) translateY(6px)";

    document.body.appendChild(el);
    return el;
  }

  function toast(msg, ms = 1600) {
    const el = ensureToast();
    el.textContent = String(msg || "");
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0px)";

    window.clearTimeout(el.__t);
    el.__t = window.setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(-50%) translateY(6px)";
    }, ms);
  }

  function error(msg) {
    toast(msg || "Ocorreu um erro.");
    console.error("❌", msg);
  }

  return { toast, error };
}

/* -----------------------------
   THEME (html.light / html.dark)
----------------------------- */
function createTheme(store) {
  const root = document.documentElement;

  function apply(mode) {
    const m = mode === "light" ? "light" : "dark";
    root.classList.remove("light", "dark");
    root.classList.add(m);
    // mantém compat com CSS que usa :root.light e html.light
    if (m === "light") root.classList.add("light");
    store.set("theme", m);
  }

  function toggle() {
    const isLight = root.classList.contains("light");
    apply(isLight ? "dark" : "light");
  }

  function init() {
    const saved = store.get("theme");
    if (saved === "light" || saved === "dark") apply(saved);
    else apply("dark");
  }

  return { init, toggle, apply };
}

/* -----------------------------
   ROUTER (hash)
----------------------------- */
function createRouter() {
  const routes = new Set(["home", "tema", "pdf", "simulados", "dashboard"]);

  function getRouteFromHash() {
    const h = String(location.hash || "#home").replace("#", "").trim();
    return routes.has(h) ? h : "home";
  }

  function go(route) {
    const r = routes.has(route) ? route : "home";
    if (location.hash !== `#${r}`) location.hash = `#${r}`;
    else window.dispatchEvent(new Event("hashchange"));
  }

  return { getRouteFromHash, go };
}

/* -----------------------------
   NAV helpers
----------------------------- */
function setActiveNav(route) {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    const to = el.getAttribute("data-nav");
    if (!to) return;
    el.classList.toggle("is-active", to === route);
  });
}

function showScreen(route) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const screen = document.getElementById(`screen-${route}`);
  if (screen) screen.classList.add("active");
}

/* -----------------------------
   GATES (login/premium)
----------------------------- */
function createGates(store) {
  function getUser() {
    const u = store.get("user");
    return u && typeof u === "object" ? u : null;
  }

  function isLogged() {
    const u = getUser();
    return !!u?.uid || !!u?.email || !!u?.name;
  }

  function isPremium() {
    const u = getUser();
    return !!u?.premium;
  }

  function requireLogin() {
    if (isLogged()) return true;
    window.dispatchEvent(new Event("liora:login-required"));
    return false;
  }

  function requirePremium() {
    if (isPremium()) return true;
    window.dispatchEvent(new Event("liora:premium-bloqueado"));
    return false;
  }

  return { getUser, isLogged, isPremium, requireLogin, requirePremium };
}

/* -----------------------------
   IMPORT dinâmico (robusto)
----------------------------- */
async function loadFeature(path, exportName) {
  try {
    const mod = await import(path);
    const obj = mod?.[exportName];
    if (!obj) {
      console.warn(`⚠️ Feature ${exportName} não encontrada em ${path}`);
      return null;
    }
    return obj;
  } catch (e) {
    console.warn(`⚠️ Não carregou ${path}:`, e);
    return null;
  }
}

/* -----------------------------
   BOOT
----------------------------- */
(async function boot() {
  const store = createStore("liora:");
  const ui = createUI();
  const router = createRouter();
  const gates = createGates(store);
  const theme = createTheme(store);

  // expõe para debug e para módulos que chamam window.router/store
  window.router = router;
  window.lioraStore = store;

  theme.init();

  // botão de tema (se existir)
  const btnTheme = document.getElementById("btn-theme") || document.querySelector("[data-action='toggleTheme']");
  btnTheme?.addEventListener("click", () => theme.toggle());

  // NAV: clique em qualquer [data-nav]
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-nav]");
    if (!el) return;

    const to = el.getAttribute("data-nav");
    if (!to) return;

    // rota canônica
    router.go(to);
  });

  // NAV via evento (fallback para módulos)
  window.addEventListener("liora:nav", (ev) => {
    const to = ev?.detail?.to;
    if (!to) return;
    router.go(to);
  });

  // Router apply
  function applyRoute() {
    const route = router.getRouteFromHash();

    setActiveNav(route);
    showScreen(route);

    // eventos canônicos por tela
    if (route === "simulados") {
      window.dispatchEvent(new Event("liora:open-simulados"));
      return;
    }

    if (route === "dashboard") {
      window.dispatchEvent(new Event("liora:open-dashboard"));
      window.dispatchEvent(new Event("liora:dashboard-refresh"));
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
  }

  window.addEventListener("hashchange", applyRoute);

  // Fallback: se sua UI usar botões com data-action de abrir telas
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-action]");
    if (!a) return;

    const act = a.getAttribute("data-action");
    if (!act) return;

    if (act === "openDashboard") return router.go("dashboard");
    if (act === "openSimulados") return router.go("simulados");
    if (act === "openTema") return router.go("tema");
    if (act === "openPdf") return router.go("pdf");
    if (act === "goHome") return router.go("home");
  });

  // Contexto padrão para features
  const ctx = { router, store, gates, ui, theme };

  // --- Carrega features (não quebra se faltar alguma) ---
  const premium = await loadFeature("./premium.js", "premium");
  premium?.init?.(ctx);

  const simulados = await loadFeature("./features/simulados.js", "simulados");
  simulados?.init?.(ctx);

  const dashboard = await loadFeature("./features/dashboard.js", "dashboard");
  dashboard?.init?.(ctx);

  // opcionais (se existirem no seu repo)
  const planos = await loadFeature("./features/planos.js", "planos");
  planos?.init?.(ctx);

  const pdf = await loadFeature("./features/pdf.js", "pdf");
  pdf?.init?.(ctx);

  const estudos = await loadFeature("./features/estudos.js", "estudos");
  estudos?.init?.(ctx);

  // handlers canônicos para login/premium (caso sua tela de login seja separada)
  window.addEventListener("liora:login-required", () => {
    // se existir screen-login, navega; senão abre modal premium (que mostra texto de login)
    if (document.getElementById("screen-login")) {
      showScreen("login");
      return;
    }
    // premium.js já escuta esse evento e abre modal.
  });

  // pequena conveniência: quando user muda, re-render do dashboard
  window.addEventListener("liora:user-changed", () => {
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  });

  // aplica rota inicial
  applyRoute();

  console.log("✅ LIORA boot ok", {
    route: router.getRouteFromHash(),
    premium: gates.isPremium(),
    logged: gates.isLogged()
  });
})();
