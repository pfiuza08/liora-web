import { auth } from "./auth.js";

const PROTECTED_API_PATHS = new Set([
  "/api/gerarPlano",
  "/api/gerarPlanoPdf",
  "/api/gerarSimulado",
  "/api/aprofundar"
]);

const PENDING_ROUTE_KEY = "liora:pending-route";

export function getAccessToken() {
  return String(auth?.session?.access_token || "");
}

export function hasAuthenticatedSession() {
  return !!getAccessToken();
}

export function requestLogin(route = "") {
  try {
    const normalized = String(route || "").trim().toLowerCase();
    if (normalized) sessionStorage.setItem(PENDING_ROUTE_KEY, normalized);
  } catch {}

  setTimeout(() => {
    if (!hasAuthenticatedSession()) {
      window.dispatchEvent(new Event("liora:login-required"));
    }
  }, 350);
}

function resumePendingRoute() {
  if (!hasAuthenticatedSession()) return;

  let route = "";
  try {
    route = sessionStorage.getItem(PENDING_ROUTE_KEY) || "";
    sessionStorage.removeItem(PENDING_ROUTE_KEY);
  } catch {}

  if (!route) return;

  setTimeout(() => {
    try {
      if (window.router?.go) window.router.go(route);
      else location.hash = `#${route}`;
    } catch {}
  }, 80);
}

function isProtectedApi(input) {
  try {
    const raw = typeof input === "string" ? input : input?.url;
    if (!raw) return false;

    const url = new URL(raw, location.origin);
    return url.origin === location.origin && PROTECTED_API_PATHS.has(url.pathname);
  } catch {
    return false;
  }
}

function installAuthenticatedFetch() {
  if (window.__lioraAuthenticatedFetchInstalled) return;
  window.__lioraAuthenticatedFetchInstalled = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function lioraAuthenticatedFetch(input, init = {}) {
    if (!isProtectedApi(input)) return nativeFetch(input, init);

    const token = getAccessToken();
    if (!token) {
      requestLogin();
      return new Response(
        JSON.stringify({
          error: "authentication_required",
          message: "Entre na Liora para usar esta funcionalidade."
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
        }
      );
    }

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

    const response = await nativeFetch(input, { ...init, headers });
    if (response.status === 401) requestLogin();

    return response;
  };
}

function renderFreeLimitsNotice() {
  const pricingPanel = document.querySelector("#screen-pricing .panel");
  if (!pricingPanel || document.getElementById("liora-free-limits-notice")) return;

  const notice = document.createElement("div");
  notice.id = "liora-free-limits-notice";
  notice.className = "muted small";
  notice.style.marginTop = "10px";
  notice.style.lineHeight = "1.5";
  notice.innerHTML =
    "<b>Plano Free:</b> requer login, permite 1 plano por tema por dia, 1 simulado por dia com até 5 questões e dashboard básico. PDF e Aprofundar são recursos Premium.";

  const intro = pricingPanel.querySelector(".muted");
  if (intro?.parentNode) intro.parentNode.insertBefore(notice, intro.nextSibling);
  else pricingPanel.prepend(notice);
}

installAuthenticatedFetch();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", renderFreeLimitsNotice, { once: true });
} else {
  renderFreeLimitsNotice();
}

window.addEventListener("liora:user-changed", resumePendingRoute);
