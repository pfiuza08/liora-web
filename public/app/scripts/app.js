// =============================================================
// 🧠 LIORA — APP (Boot + Theme + Gates + Features)
// Versão: v85.3-FREEMIUM-MVP (supabase auth + hotmart ready + anti-duplicação listeners)
// -------------------------------------------------------------
// ✔ Router por hash via ./router.js (telas: home, tema, pdf, simulados, dashboard, pricing)
// ✔ Nav por [data-nav] e marca ativo (is-active) via router.js
// ✔ Theme toggle (html.light / html.dark)
// ✔ Store (localStorage) + UI helpers (toast/error + loading overlay)
// ✔ Gates (login/premium) via eventos canônicos
// ✔ Boot com imports dinâmicos
// ✔ Auth via Supabase Magic Link (auth.js)
// ✔ Premium via profiles/pending (auth.js + /api/consume-pending)
// ✔ Reset demo + badge (só com ?demo=1)
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
   UI (toast + error + loading)
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
   - Preferir gates do seu módulo (window.lioraGates / ctx.gates real),
     mas manter fallback local para não quebrar boot.
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
   LIMITES (Free vs Premium) — diário
   - Tema: 3/dia
   - PDF: 1/dia
   - Simulados: 2/dia
----------------------------- */
function createLimiter(store, gates) {
  const KEY = "usage:v1";
  const today = () => new Date().toISOString().slice(0, 10);

  function read() {
    const raw = store.get(KEY);
    if (!raw || typeof raw !== "object") return { day: today(), tema: 0, pdf: 0, simulados: 0 };
    return raw;
  }

  function write(obj) {
    store.set(KEY, obj);
  }

  function ensureToday() {
    const u = read();
    const d = today();
    if (u.day !== d) {
      const reset = { day: d, tema: 0, pdf: 0, simulados: 0 };
      write(reset);
      return reset;
    }
    return u;
  }

  const LIMITS = { tema: 3, pdf: 1, simulados: 2 };

  function left(feature) {
    if (gates.isPremium()) return Infinity;
    const u = ensureToday();
    const used = Number(u[feature] || 0);
    const max = Number(LIMITS[feature] || 0);
    return Math.max(0, max - used);
  }

  function can(feature) {
    if (gates.isPremium()) return true;
    return left(feature) > 0;
  }

  function hit(feature) {
    if (gates.isPremium()) return { ok: true, left: Infinity };
    const u = ensureToday();
    u[feature] = Number(u[feature] || 0) + 1;
    write(u);
    return { ok: true, left: left(feature) };
  }

  function label(feature) {
    const u = ensureToday();
    const used = Number(u[feature] || 0);
    const max = Number(LIMITS[feature] || 0);
    return `${used}/${max} hoje`;
  }

  return { can, hit, left, label };
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
   LOGIN (modal + header state)
----------------------------- */
function wireLogin(ctx) {
  function ensureLoginModal() {
    // garante que não existe modal duplicado
    const all = document.querySelectorAll("#liora-login");
    if (all.length > 1) all.forEach((n, idx) => idx > 0 && n.remove());
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
              <div class="liora-modal-sub muted">Entre com Google ou receba um link por e-mail.</div>
            </div>
            <button class="btn-secondary" data-login-action="close">Fechar</button>
          </div>
      
          <div class="liora-modal-body">
      
            <div class="muted small" style="margin-bottom:10px;">
              Dica: Google é mais rápido. O link por e-mail é útil se você preferir.
            </div>
      
            <button class="btn-primary liora-google-btn" style="width:100%; display:flex; align-items:center; justify-content:center; gap:10px;" data-login-action="google">
              <span aria-hidden="true" style="display:inline-flex; width:18px; height:18px;">
                <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.73 1.22 9.25 3.6l6.9-6.9C36.36 2.7 30.64 0 24 0 14.62 0 6.51 5.38 2.56 13.22l8.02 6.22C12.46 13.3 17.77 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h12.94c-.56 3-2.23 5.54-4.74 7.26l7.27 5.64C43.52 38.26 46.98 31.98 46.98 24.55z"/>
                  <path fill="#FBBC05" d="M10.58 28.56c-.48-1.45-.76-2.99-.76-4.56s.28-3.11.76-4.56l-8.02-6.22C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l8.02-6.22z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.92-2.14 15.9-5.82l-7.27-5.64c-2.02 1.36-4.6 2.16-8.63 2.16-6.23 0-11.54-3.8-13.42-9.94l-8.02 6.22C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
              </span>
              <span>Entrar com Google</span>
            </button>
      
            <div class="muted small" style="margin-top:10px; line-height:1.35; opacity:.90;">
              Você será direcionado ao login seguro do Google e retornará para <b>getliora.ia.br</b>.
            </div>
      
            <div class="muted small" style="margin:10px 0; text-align:center; opacity:.85;">
              ou
            </div>
      
            <div class="muted small" style="text-align:center; opacity:.75; margin-bottom:8px;">
              Dica: confira o cadeado do navegador 🔒
            </div>
      
            <label class="label">E-mail</label>
            <input id="liora-login-email" class="input" placeholder="voce@exemplo.com" />
      
            <div class="muted small" style="margin-top:10px;">
              Verifique spam e promoções. O link abre a Liora já logada neste dispositivo.
            </div>
      
            <!-- Versão mais discreta -->
            <div class="muted small" style="margin-top:12px; line-height:1.35; opacity:.85;">
              Ao continuar: <a href="/termos" target="_blank" rel="noopener noreferrer">Termos</a> ·
              <a href="/privacidade" target="_blank" rel="noopener noreferrer">Privacidade</a>
            </div>
      
          </div>
      
          <div class="liora-modal-actions" style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="btn-secondary" style="flex:1; min-width:200px;" data-login-action="magic">
              Enviar link de acesso
            </button>
            <button class="btn-secondary" style="flex:1; min-width:200px;" data-login-action="close">
              Cancelar
            </button>
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
    setTimeout(() => document.getElementById("liora-login-email")?.focus(), 50);
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

  if (!window.__lioraLoginWired) {
    window.__lioraLoginWired = true;

    document.getElementById("btn-login")?.addEventListener("click", () => openLogin());

    document.getElementById("btn-logout")?.addEventListener("click", async () => {
      try {
        if (ctx?.auth?.signOut) await ctx.auth.signOut();
      } catch {}

      clearUserSafe();
      ctx?.ui?.toast?.("Sessão encerrada.");
      ctx?.router?.go?.("home");
    });

    window.addEventListener("liora:open-login", () => openLogin());
    window.addEventListener("liora:login-required", () => openLogin());
    window.addEventListener("liora:user-changed", () => {
        updateHeaderAuthUI();
      
        // fecha o modal automaticamente quando o login completar
        const u = getUserSafe();
        const logged = !!u?.uid || !!u?.email || !!u?.name;
        if (logged) closeLogin();
      });
     // ✅ 3) fecha o modal quando trocar de rota
      window.addEventListener("liora:route-changed", () => {
        try { closeLogin(); } catch {}
      });
     
    // ✅ fecha automaticamente quando virar logged
      window.addEventListener("liora:user-changed", () => {
        try {
          const u = getUserSafe();
          const logged = !!u?.uid || !!u?.email || !!u?.name;
          if (logged) closeLogin();
        } catch {}
      });
     
    // modal actions (1 listener só) — ✅ corrigido
    document.addEventListener("click", (ev) => {
      const modal = document.getElementById("liora-login");
      if (!modal || modal.classList.contains("hidden")) return;

      const a = ev.target.closest("[data-login-action]");
      if (!a) return;

      const act = a.getAttribute("data-login-action");
      if (act === "close") return closeLogin();

      if (act === "google") {
        if (!ctx?.auth?.signInWithGoogle) {
          ctx?.ui?.toast?.("Login Google não carregou. Recarregue a página.");
          return;
        }

        // trava simples para evitar duplo clique
        window.__lioraGoogle = window.__lioraGoogle || { busy: false };
        if (window.__lioraGoogle.busy) return ctx?.ui?.toast?.("Abrindo Google…");

        window.__lioraGoogle.busy = true;
        a.disabled = true;
        ctx?.ui?.loading?.("Abrindo Google…");

        ctx.auth.signInWithGoogle("/app/").then(({ error }) => {
          // Normal: o browser vai redirecionar, então isso pode nem executar.
          // Se falhar antes do redirect, cai aqui.
          ctx?.ui?.loading?.(false);
          window.__lioraGoogle.busy = false;
          a.disabled = false;

          if (error) {
            console.warn("❌ Google login error:", error);
            ctx?.ui?.toast?.("Falha ao abrir o Google. Verifique as URLs no Google Cloud e no Supabase.");
            return;
          }
        }).catch((e) => {
          ctx?.ui?.loading?.(false);
          window.__lioraGoogle.busy = false;
          a.disabled = false;
          console.warn("❌ Google login exception:", e);
          ctx?.ui?.toast?.("Falha inesperada ao abrir o Google.");
        });

        return;
      }

      if (act === "magic") {
        const email = (document.getElementById("liora-login-email")?.value || "").trim();
        if (!email) return ctx?.ui?.toast?.("Digite seu e-mail.");
        if (!ctx?.auth?.sendMagicLink) return ctx?.ui?.toast?.("Auth não carregou. Recarregue a página.");

        // trava global simples (evita duplo clique)
        window.__lioraMagic = window.__lioraMagic || { busy: false, lastAt: 0, cooldownMs: 60000, tries: 0 };

        const now = Date.now();
        const left = window.__lioraMagic.lastAt
          ? (window.__lioraMagic.cooldownMs - (now - window.__lioraMagic.lastAt))
          : 0;

        if (left > 0) return ctx?.ui?.toast?.(`Aguarde ${Math.ceil(left / 1000)}s para reenviar o link.`);
        if (window.__lioraMagic.busy) return ctx?.ui?.toast?.("Enviando link…");

        window.__lioraMagic.busy = true;
        window.__lioraMagic.lastAt = now;
        window.__lioraMagic.tries++;

        a.disabled = true;
        ctx?.ui?.loading?.("Enviando link…");

        ctx.auth.sendMagicLink(email).then(({ error }) => {
          ctx?.ui?.loading?.(false);

          if (error) {
            const msg = String(error?.message || "").toLowerCase();
            const status = String(error?.status || "");
            const isRate = msg.includes("rate") || status.includes("429");

            window.__lioraMagic.cooldownMs = isRate ? 120000 : 60000;
            ctx?.ui?.toast?.(
              isRate
                ? "Limite de envios atingido. Aguarde 2 minutos e tente novamente."
                : "Falha ao enviar link. Tente novamente."
            );

            window.__lioraMagic.busy = false;
            setTimeout(() => { a.disabled = false; }, 800);
            return;
          }

          // ✅ sucesso (uma vez só)
          window.__lioraMagic.cooldownMs = 60000;
          ctx?.ui?.toast?.("Link enviado! Verifique seu e-mail (spam/promoções).");

          window.__lioraMagic.busy = false;
          setTimeout(() => { a.disabled = false; }, 800);
        });

        return;
      }
    });
  }

  ensureLoginModal();
  updateHeaderAuthUI();
}

/* -----------------------------
   DEMO tools (só com ?demo=1)
----------------------------- */
function isDemoMode() {
  try {
    return new URLSearchParams(location.search).get("demo") === "1";
  } catch {
    return false;
  }
}

function demoResetInit() {
  if (window.__lioraDemoResetWired) return;
  window.__lioraDemoResetWired = true;

  function showDemoTools() {
    const box = document.getElementById("demo-tools");
    if (!box) return;
    box.classList.toggle("hidden", !isDemoMode());
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
      if (!isDemoMode()) return;
      const ok = window.confirm("Resetar a demo? Isso apaga os dados locais da Liora neste navegador.");
      if (!ok) return;

      resetLioraStorage();

      try { location.hash = "#home"; } catch {}
      try {
        const url = new URL(location.href);
        url.searchParams.set("demo", "1");
        location.replace(url.toString());
      } catch {
        location.reload();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
}

function demoBadgeInit() {
  if (window.__lioraDemoBadgeWired) return;
  window.__lioraDemoBadgeWired = true;

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
    badge.classList.toggle("hidden", !isDemoMode());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureBadge);
  else ensureBadge();

  window.addEventListener("hashchange", ensureBadge);
}

/* -----------------------------
   BOOT
----------------------------- */
(async function boot() {
  const store = createStore("liora:");
  const ui = createUI();
  const theme = createTheme(store);

  // gates fallback local
  const gatesFallback = createGates(store);

  // expõe para debug
  window.lioraStore = store;

  theme.init();

  // botão de tema (se existir)
  const btnTheme = document.getElementById("btn-theme") || document.querySelector("[data-action='toggleTheme']");
  btnTheme?.addEventListener("click", () => theme.toggle());

  // Contexto padrão para features (gates final será substituído quando o módulo gates existir)
  const ctx = { store, gates: gatesFallback, ui, theme };
  ctx.limits = createLimiter(store, ctx.gates);

  // -----------------------------
  // 🔐 Supabase Auth (Magic Link)
  // -----------------------------
  const authMod = await loadFeature("./auth.js", "auth");
if (authMod?.init) {
  ctx.auth = authMod;
  authMod.init(ctx);

  // ✅ GARANTIR que premium (profiles) esteja sempre atualizado
  // - roda no boot (com pequeno delay para dar tempo do getSession/_handleSession)
  // - roda quando a aba voltar para frente (focus/visibilitychange)
  (function wireProfileAutoRefresh() {
    if (window.__lioraProfileAutoRefreshWired) return;
    window.__lioraProfileAutoRefreshWired = true;

    let busy = false;

    async function refreshNow(reason = "auto") {
      try {
        if (busy) return;
        if (!ctx?.auth?.refreshProfile) return;

        // só faz sentido se estiver logado
        if (typeof ctx.auth.isLogged === "function" && !ctx.auth.isLogged()) return;

        busy = true;
        const out = await ctx.auth.refreshProfile(ctx);
        if (window.lioraDebug) console.log("🔄 refreshProfile", { reason, out });
      } catch (e) {
        if (window.lioraDebug) console.warn("⚠️ refreshProfile falhou:", e);
      } finally {
        busy = false;
      }
    }

    // 1) boot: roda uma vez logo após iniciar
    setTimeout(() => refreshNow("boot"), 900);

    // 2) quando a aba volta para frente
    window.addEventListener("focus", () => refreshNow("focus"));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refreshNow("visible");
    });

    // 3) quando o usuário “aparecer” no store, reforça mais uma vez (one-shot)
    const onFirstUser = () => {
      window.removeEventListener("liora:user-changed", onFirstUser);
      setTimeout(() => refreshNow("first-user"), 300);
    };
    window.addEventListener("liora:user-changed", onFirstUser);
  })();
} else {
  console.warn("⚠️ auth.js não carregou (verifique ./auth.js em /app/scripts)");
}

  // -----------------------------
  // 🔒 Gates (módulo real) — preferir o seu gates v2
  // -----------------------------
  const gatesMod = await loadFeature("./gates.js", "gates");
  if (gatesMod) {
    // gates do seu módulo espera store como argumento (recomendado)
    ctx.gates = gatesMod;
    // atualiza limiter para usar gates real
    ctx.limits = createLimiter(store, {
      isPremium: () => !!gatesMod.isPremium?.(store) || !!gatesFallback.isPremium()
    });
    console.log("🔒 gates.js ativo");
  } else {
    // fallback continua
    console.log("🔒 gates fallback ativo");
  }

  // -----------------------------
  // ✅ Router (único) via módulo
  // -----------------------------
  const routerMod = await loadFeature("./router.js", "router");
  if (routerMod?.init) {
    routerMod.init();
    window.router = routerMod;
    ctx.router = routerMod;
    wireRouteEvents(routerMod);
  } else {
    console.warn("⚠️ router.js não carregou. Verifique o caminho ./router.js");
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
  // NAV fallback por data-action
  // -----------------------------
  if (!window.__lioraNavFallbackWired) {
    window.__lioraNavFallbackWired = true;

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
  }

  // -----------------------------
  // ✅ Login modal + header state
  // -----------------------------
  wireLogin(ctx);

  // -----------------------------
  // Features
  // -----------------------------
  const premium = await loadFeature("./premium.js", "premium");
  premium?.init?.(ctx);

  const simulados = await loadFeature("./features/simulados.js", "simulados");
  simulados?.init?.(ctx);

  const dashboard = await loadFeature("./features/dashboard.js", "dashboard");
  dashboard?.init?.(ctx);

  const pricing = await loadFeature("./features/pricing.js", "pricing");
  pricing?.init?.(ctx);

  const planos = await loadFeature("./features/planos.js", "planos");
  planos?.init?.(ctx);

  const pdf = await loadFeature("./features/pdf.js", "pdf");
  pdf?.init?.(ctx);

  // conveniência
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

      if (data.sessions.length > 1200) data.sessions = data.sessions.slice(-1200);

      localStorage.setItem(key, JSON.stringify(data));

      window.dispatchEvent(new CustomEvent("liora:stats-changed", { detail: { type: "session" } }));
      window.dispatchEvent(new Event("liora:dashboard-refresh"));
    } catch (e) {
      console.warn("⚠️ Falha ao salvar session:", e);
    }
  });

  // render inicial
  window.dispatchEvent(new Event("liora:dashboard-refresh"));

  // demo tools
  demoResetInit();
  demoBadgeInit();

  console.log("✅ LIORA boot ok", {
    route: ctx.router?.getInitialRoute?.() || (location.hash || "#home"),
    premium: (ctx.gates?.isPremium ? !!ctx.gates.isPremium(store) : gatesFallback.isPremium()),
    logged: (ctx.gates?.isLogged ? !!ctx.gates.isLogged(store) : gatesFallback.isLogged())
  });
})();
