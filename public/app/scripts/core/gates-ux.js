// /scripts/core/gates-ux.js
// UX padrão para gates (visitante/free/premium): explica primeiro, depois oferece ação.

export const gatesUX = {
  // Retorna true se BLOQUEOU (e já explicou). Retorna false se ok.
  async explainAndRoute({
    ctx = null,
    check = null,              // { ok: false, reason?: "login"|"limit"|"premium"|... , msg?: string }
    source = "geral",          // "pdf" | "tema" | "simulados" | "aprofundar" | ...
    statusElId = null,         // ex: "pdf-status"
    statusEl = null,           // elemento direto (opcional)
    delay = 250,               // pequeno respiro antes de abrir qualquer coisa
    mode = "ask",              // "ask" (padrão) | "auto" | "none"
    events = {
      loginRequired: "liora:login-required",
      premiumBlocked: "liora:premium-bloqueado",
      openPricing: "liora:open-pricing", // ou "liora:open-plans" se você preferir
    },
    // Opcional: customizar textos
    copy = null,               // { title?, body?, ctaYes?, ctaNo? }
  } = {}) {
    if (!check || check.ok !== false) return false;

    const reasonRaw = (check.reason || "").toLowerCase();
    const reason =
      reasonRaw.includes("login") ? "login" :
      reasonRaw.includes("limit") ? "limit" :
      (reasonRaw.includes("premium") || reasonRaw.includes("pro") || reasonRaw.includes("paid")) ? "premium" :
      "limit";

    const label =
      source === "pdf" ? "por PDF" :
      source === "tema" ? "de Tema" :
      source === "simulados" ? "de Simulados" :
      source === "aprofundar" ? "de Aprofundar" :
      "";

    // Mensagem padrão (humana, sem bronca)
    const defaults = {
      login: {
        title: "Entrar para continuar",
        body: `Pra continuar ${label ? label : ""}, você precisa entrar (é rapidinho). Assim a Liora salva seu progresso e libera novos usos.`,
        ctaYes: "Entrar agora",
        ctaNo: "Agora não",
      },
      limit: {
        title: "Limite de hoje atingido",
        body: `Você chegou no limite de hoje ${label ? `na função ${label}` : "nessa função"}. Entre para continuar (e sincronizar seu uso) ou desbloqueie o Premium para limites maiores.`,
        ctaYes: "Ver opções",
        ctaNo: "Agora não",
      },
      premium: {
        title: "Funcionalidade Premium",
        body: `Essa funcionalidade ${label ? `(${label})` : ""} é Premium. Você pode ver os planos para desbloquear ou continuar usando o que já está disponível no Free.`,
        ctaYes: "Ver planos",
        ctaNo: "Continuar no Free",
      },
    };

    const chosen = defaults[reason];

    // Se o gate já vier com msg, respeita (mas mantém o tom)
    const body = (copy?.body || check.msg || chosen.body).trim();
    const title = (copy?.title || chosen.title).trim();
    const ctaYes = (copy?.ctaYes || chosen.ctaYes).trim();
    const ctaNo = (copy?.ctaNo || chosen.ctaNo).trim();

    // 1) Mostrar mensagem (toast + status inline)
    try { ctx?.ui?.toast?.(`${title}. ${body}`); } catch {}

    const st = statusEl || (statusElId ? document.getElementById(statusElId) : null);
    if (st) st.textContent = `${title}. ${body}`;

    // 2) Oferecer opção (sem teleporte agressivo)
    if (mode === "none") return true;

    // Função para confirmar com UI própria (se existir) ou fallback window.confirm
    const confirmFn = async (question) => {
      try {
        if (ctx?.ui?.confirm) return await ctx.ui.confirm(question, { okText: ctaYes, cancelText: ctaNo });
      } catch {}
      return window.confirm(question);
    };

    const route = () => {
      if (reason === "login") {
        window.dispatchEvent(new Event(events.loginRequired));
        return;
      }
      // para limit e premium, você pode escolher entre abrir pricing direto
      // ou apenas sinalizar premium-bloqueado (que pode abrir seu modal amigável)
      window.dispatchEvent(new Event(events.premiumBlocked));
      // se preferir abrir pricing imediatamente, use:
      // window.dispatchEvent(new Event(events.openPricing));
    };

    if (mode === "auto") {
      setTimeout(route, delay);
      return true;
    }

    // mode === "ask" (padrão): pergunta e só abre se a pessoa quiser
    setTimeout(async () => {
      const question =
        reason === "login"
          ? `${title}\n\n${body}\n\nQuer entrar agora?`
          : `${title}\n\n${body}\n\nQuer ver as opções para desbloquear?`;

      const yes = await confirmFn(question);
      if (yes) route();
    }, delay);

    return true;
  }
};

// também expõe no window (útil para módulos antigos)
try { window.gatesUX = gatesUX; } catch {}
