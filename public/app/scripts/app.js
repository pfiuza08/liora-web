// =============================================================
// 🧠 LIORA — APP (Boot + Theme + Gates + Features)
// Versão: v85.1-FREEMIUM-MVP (router.js único + pricing + eventos por rota + login mock)
// -------------------------------------------------------------
// ✔ Router por hash via ./router.js (telas: home, tema, pdf, simulados, dashboard, pricing)
// ✔ Nav por [data-nav] e marca ativo (is-active) via router.js
// ✔ Theme toggle (html.light / html.dark)
// ✔ Store (localStorage) + UI helpers (toast/error simples)
// ✔ Gates (login/premium) via eventos canônicos
// ✔ Boot com imports dinâmicos (não quebra se faltar módulo)
// ✔ Integra Premium Modal (premium.js)
// ✔ Carrega pricing (pricing.js)
// ✔ Dispara eventos liora:open-* ao trocar rota (inclui pricing)
// ✔ Login MOCK (modal simples) + header state (Visitante/Free/Premium)
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

  // Loading overlay (compat com features antigas)
    function loading(a = true, b = "Processando…") {
    // aceita: loading(true, "texto"), loading(false), loading("texto")
    let show = true;
    let text = "Processando…";

    if (typeof a === "boolean") {
      show = a;
      text = typeof b === "string" ? b : text;
    } else if (typeof a === "string") {
      show = true;
      text = a;
    } else {
      show = !!a;
    }

    try {
      const box = document.getElementById("ui-loading");
      const txt = document.getElementById("ui-loading-text");
      if (!box) return;

      if (txt) txt.textContent = text || "Processando…";
      box.classList.toggle("hidden", !show);
      box.setAttribute("aria-hidden", show ? "false" : "true");
    } catch (e) {
      console.warn("⚠️ ui.loading falhou:", e);
    }
  }


  function hideLoading() {
    loading(false);
  }

  return { toast, error, loading, hideLoading };

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
   ROUTE -> EVENTOS CANÔNICOS
----------------------------- */
function wireRouteEvents(router) {
  const emitFor = (routeRaw) => {
    const route = String(routeRaw || "").trim().toLowerCase();

    if (route === "simulados") return window.dispatchEvent(new Event("liora:open-simulados"));

    if (route === "dashboard") {
      window.dispatchEvent(new Event("liora:open-dashboard"));
      window.dispatchEvent(new Event("liora:dashboard-refresh"));
      return;
    }

    if (route === "pricing") return window.dispatchEvent(new Event("liora:open-pricing"));
    if (route === "tema") return window.dispatchEvent(new Event("liora:open-tema"));
    if (route === "pdf") return window.dispatchEvent(new Event("liora:open-pdf"));
    if (route === "home") return window.dispatchEvent(new Event("liora:open-home"));
    if (route === "login") return window.dispatchEvent(new Event("liora:open-login"));
  };

  window.addEventListener("liora:route-changed", (ev) => {
    emitFor(ev?.detail?.route);
  });

  window.addEventListener("hashchange", () => {
    try {
      const r = router?.getInitialRoute?.() || (location.hash || "#home").replace("#", "");
      emitFor(r);
    } catch {}
  });

  try {
    const r0 = router?.getInitialRoute?.() || (location.hash || "#home").replace("#", "");
    emitFor(r0);
  } catch {}
}

/* -----------------------------
   LOGIN MOCK (modal simples + header state)
----------------------------- */
function wireLoginMock(ctx) {
  function ensureLoginModal() {
  if (document.getElementById("liora-login")) return;

  const el = document.createElement("div");
  el.id = "liora-login";
  el.className = "liora-modal hidden";
  el.innerHTML = `
    <div class="liora-modal-backdrop" data-login-action="close"></div>

    <div class="liora-modal-card" style="max-width:520px;">
      <div class="liora-modal-head">
        <div>
          <div class="liora-modal-title">Entrar</div>
          <div class="liora-modal-sub muted">Receba um link por e-mail para acessar.</div>
        </div>
        <button class="btn-secondary" data-login-action="close">Fechar</button>
      </div>

      <div class="liora-modal-body">
        <label class="label">E-mail</label>
        <input id="liora-login-email" class="input" placeholder="voce@exemplo.com" />

        <button class="btn-primary" style="width:100%; margin-top:10px;" data-login-action="magic">
          Enviar link de acesso
        </button>

        <div class="muted small" style="margin-top:10px;">
          Dica: verifique spam e promoções. O link abre a Liora já logada neste dispositivo.
        </div>
      </div>

      <div class="liora-modal-actions">
        <button class="btn-secondary" data-login-action="close">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
}


  function openLogin() {
    ensureLoginModal();
    const modal = document.getElementById("liora-login");
    if (!modal) return;
    modal.classList.remove("hidden");
    document.body.classList.add("liora-modal-open");
    setTimeout(() => document.getElementById("liora-login-name")?.focus(), 50);
  }

  function closeLogin() {
    const modal = document.getElementById("liora-login");
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.classList.remove("liora-modal-open");
  }

  function getUserSafe() {
    const u = ctx?.store?.get?.("user");
    return u && typeof u === "object" ? u : null;
  }

  function setUserSafe(u) {
    ctx?.store?.set?.("user", u);
    window.dispatchEvent(new Event("liora:user-changed"));
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  }

  function clearUserSafe() {
    ctx?.store?.remove?.("user");
    window.dispatchEvent(new Event("liora:user-changed"));
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  }

  function updateHeaderAuthUI() {
    const btnLogin = document.getElementById("btn-login");
    const btnLogout = document.getElementById("btn-logout");

    let pill = document.getElementById("liora-auth-pill");
    if (!pill) {
      pill = document.createElement("span");
      pill.id = "liora-auth-pill";
      pill.className = "pill pill-base";
      pill.style.marginRight = "8px";
      const host = document.querySelector(".header-actions");
      host?.insertBefore(pill, btnLogin || host.firstChild);
    }

    const u = getUserSafe();
    const logged = !!u?.name || !!u?.email || !!u?.uid;
    const premium = !!u?.premium;

    if (!logged) {
      pill.textContent = "Visitante";
      pill.className = "pill pill-base";
      btnLogin?.classList.remove("hidden");
      btnLogout?.classList.add("hidden");
      return;
    }

    if (premium) {
      pill.textContent = "Premium";
      pill.className = "pill pill-mvp";
    } else {
      pill.textContent = "Free";
      pill.className = "pill pill-upload";
    }

    btnLogin?.classList.add("hidden");
    btnLogout?.classList.remove("hidden");
  }

  // header buttons
  document.getElementById("btn-login")?.addEventListener("click", () => openLogin());
  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    try {
      if (ctx?.auth?.signOut) await ctx.auth.signOut();
    } catch (e) {}

    clearUserSafe();
    ctx?.ui?.toast?.("Sessão encerrada.");
    ctx?.router?.go?.("home");
  });


  // eventos canônicos
  window.addEventListener("liora:open-login", () => openLogin());
  window.addEventListener("liora:login-required", () => openLogin());
  window.addEventListener("liora:user-changed", () => updateHeaderAuthUI());

 // modal actions
  document.addEventListener("click", (ev) => {
  const modal = document.getElementById("liora-login");
  if (!modal || modal.classList.contains("hidden")) return;

  const a = ev.target.closest("[data-login-action]");
  if (!a) return;

  const act = a.getAttribute("data-login-action");
  if (act === "close") return closeLogin();

  if (act === "magic") {
    const email = (document.getElementById("liora-login-email")?.value || "").trim();

    if (!email) {
      ctx?.ui?.toast?.("Digite seu e-mail.");
      return;
    }

    if (!ctx?.auth?.sendMagicLink) {
      ctx?.ui?.toast?.("Auth ainda não carregou.");
      return;
    }

    ctx?.ui?.loading?.("Enviando link…");
    ctx.auth.sendMagicLink(email).then(({ error }) => {
      ctx?.ui?.loading?.(false);

      if (error) {
        console.warn("⚠️ magic link error:", error);
        ctx?.ui?.toast?.("Falha ao enviar link. Tente novamente.");
        return;
      }

      ctx?.ui?.toast?.("Link enviado! Verifique seu e-mail.");
      // opcional: manter modal aberto para o usuário ler a dica
      // closeLogin();
    });

    return;
  }
});

  // init
  ensureLoginModal();
  updateHeaderAuthUI();
}

/* -----------------------------
   BOOT
----------------------------- */
(async function boot() {
  const store = createStore("liora:");
  const ui = createUI();
  const gates = createGates(store);
  const theme = createTheme(store);

  // expõe para debug
  window.lioraStore = store;

  theme.init();

  // botão de tema (se existir)
  const btnTheme =
    document.getElementById("btn-theme") ||
    document.querySelector("[data-action='toggleTheme']");
  btnTheme?.addEventListener("click", () => theme.toggle());

  // Contexto padrão para features
  const ctx = { store, gates, ui, theme };

  // -----------------------------
  // 🔐 Supabase Auth (Magic Link)
  // -----------------------------
  const authMod = await loadFeature("./auth.js", "auth");
  if (authMod?.init) {
    ctx.auth = authMod;
    authMod.init(ctx);
  } else {
    console.warn("⚠️ auth.js não carregou (verifique ./auth.js em /app/scripts)");
  }
 
  // -----------------------------
  // ✅ Router (único) via módulo
  // -----------------------------
  const routerMod = await loadFeature("./router.js", "router");
  if (routerMod?.init) {
    routerMod.init();
    window.router = routerMod; // para features chamarem window.router.go(...)
    ctx.router = routerMod;

    // liga eventos por rota (inclui pricing)
    wireRouteEvents(routerMod);
  } else {
    console.warn("⚠️ router.js não carregou. Verifique o caminho ./router.js");
    // fallback mínimo: não quebra tudo
    window.router = {
      go(r) {
        const rr = String(r || "home");
        location.hash = `#${rr}`;
        window.dispatchEvent(new CustomEvent("liora:route-changed", { detail: { route: rr } }));
      },
      getInitialRoute() {
        return (location.hash || "#home").replace("#", "");
      }
    };
    ctx.router = window.router;
    wireRouteEvents(window.router);
  }

  // -----------------------------
  // NAV fallback por data-action (se sua UI tiver)
  // -----------------------------
  document.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-action]");
    if (!a) return;

    const act = a.getAttribute("data-action");
    if (!act) return;

    if (act === "openDashboard") return ctx.router.go("dashboard");
    if (act === "openSimulados") return ctx.router.go("simulados");
    if (act === "openTema") return ctx.router.go("tema");
    if (act === "openPdf") return ctx.router.go("pdf");
    if (act === "openPricing") return ctx.router.go("pricing");
    if (act === "goHome") return ctx.router.go("home");
  });

  // -----------------------------
  // ✅ Login Mock (MVP)
  // -----------------------------
  wireLoginMock(ctx);

  // -----------------------------
  // Features (não quebra se faltar)
  // -----------------------------
  const premium = await loadFeature("./premium.js", "premium");
  premium?.init?.(ctx);

  const simulados = await loadFeature("./features/simulados.js", "simulados");
  simulados?.init?.(ctx);

  const dashboard = await loadFeature("./features/dashboard.js", "dashboard");
  dashboard?.init?.(ctx);

  const pricing = await loadFeature("./features/pricing.js", "pricing");
  pricing?.init?.(ctx);

  // opcionais (se existirem no seu repo)
  const planos = await loadFeature("./features/planos.js", "planos");
  planos?.init?.(ctx);

  const pdf = await loadFeature("./features/pdf.js", "pdf");
  pdf?.init?.(ctx);

  //const estudos = await loadFeature("./features/estudos.js", "estudos");
  //estudos?.init?.(ctx);

  // -----------------------------
  // conveniência: quando user muda, re-render do dashboard
  // -----------------------------
  window.addEventListener("liora:user-changed", () => {
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  });

  // -------------------------------------------------
  // ✅ STUDY SESSIONS -> STATS (sessions)
  // -------------------------------------------------
  window.addEventListener("liora:study-session-done", (ev) => {
    const detail = ev?.detail || {};
    const key = "liora_stats:v1";

    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : { attempts: [], sessions: [], meta: {} };

      data.attempts = Array.isArray(data.attempts) ? data.attempts : [];
      data.sessions = Array.isArray(data.sessions) ? data.sessions : [];
      data.meta = data.meta && typeof data.meta === "object" ? data.meta : {};

      data.sessions.push({
        ts: Date.now(),
        date: new Date().toISOString().slice(0, 10),
        tema: String(detail.tema || "—"),
        sessao: String(detail.sessao || "—"),
        timeSec: Number(detail.timeSec || 0),
        source: String(detail.source || "app")
      });

      // guarda só as últimas 1200 sessões
      if (data.sessions.length > 1200) data.sessions = data.sessions.slice(-1200);

      localStorage.setItem(key, JSON.stringify(data));

      // eventos que o dashboard já escuta
      window.dispatchEvent(
        new CustomEvent("liora:stats-changed", { detail: { type: "session" } })
      );
      window.dispatchEvent(new Event("liora:dashboard-refresh"));
    } catch (e) {
      console.warn("⚠️ Falha ao salvar session:", e);
    }
  });

  // ✅ render inicial do dashboard
  window.dispatchEvent(new Event("liora:dashboard-refresh"));

  console.log("✅ LIORA boot ok", {
    route: ctx.router?.getInitialRoute?.() || (location.hash || "#home"),
    premium: gates.isPremium(),
    logged: gates.isLogged()
  });
// =============================================================
// 🧼 Reset Demo (aparece só com ?demo=1)
// - Limpa apenas: liora:* e liora_stats:v1
// - Volta para #home e recarrega
// =============================================================
(function demoReset() {
  function isDemo() {
    try {
      const p = new URLSearchParams(location.search);
      return p.get("demo") === "1";
    } catch (e) {
      return false;
    }
  }

  function showDemoTools() {
    const box = document.getElementById("demo-tools");
    if (!box) return;
    if (isDemo()) box.classList.remove("hidden");
    else box.classList.add("hidden");
  }

  function resetLioraStorage() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith("liora:")) keysToRemove.push(k);
        if (k === "liora_stats:v1") keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch (e) {
      console.warn("⚠️ reset demo falhou:", e);
    }
  }

  function wire() {
    showDemoTools();

    const btn = document.getElementById("btn-reset-demo");
    if (!btn) return;

    btn.addEventListener("click", () => {
      if (!isDemo()) return; // segurança extra
      const ok = window.confirm("Resetar a demo? Isso apaga os dados locais da Liora neste navegador.");
      if (!ok) return;

      resetLioraStorage();

      try { location.hash = "#home"; } catch (e) {}
      try {
        // mantém o modo demo na URL
        const url = new URL(location.href);
        url.searchParams.set("demo", "1");
        location.replace(url.toString());
      } catch (e) {
        location.reload();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})();
// =============================================================
// 🏷️ Selo DEMO no header (só com ?demo=1)
// =============================================================
(function demoBadge() {
  function isDemo() {
    try {
      return new URLSearchParams(location.search).get("demo") === "1";
    } catch {
      return false;
    }
  }

  function ensureBadge() {
    const host = document.querySelector(".header-actions");
    if (!host) return;

    let badge = document.getElementById("liora-demo-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "liora-demo-badge";
      badge.className = "pill pill-base";
      badge.style.marginRight = "8px";
      badge.style.opacity = "0.9";
      badge.style.borderStyle = "dashed";
      badge.textContent = "DEMO";
      host.insertBefore(badge, host.firstChild);
    }
    badge.classList.toggle("hidden", !isDemo());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureBadge);
  } else {
    ensureBadge();
  }

  window.addEventListener("hashchange", ensureBadge);
})();
   
})();
