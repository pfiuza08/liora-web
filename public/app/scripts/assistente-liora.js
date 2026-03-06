// assistente-liora.js
// =========================================================
// 🤖 Assistente da Liora — V3
// Memória curta + matching melhor + analytics local
// =========================================================

(function () {
  var MEMORY_LIMIT = 8;
  var autoOpenedByGate = false;
  var ANALYTICS_KEY = "liora:assist:analytics:v1";

  var knowledge = [
    {
      id: "como_comecar",
      keywords: [
        "como começar", "como comecar", "por onde começo", "por onde comeco",
        "começar", "comecar", "estou perdido", "estou perdida",
        "perdido", "perdida", "início", "inicio", "não sei por onde começar",
        "nao sei por onde comecar"
      ],
      response:
        "Se você já tem material, comece por PDF. Se quer estudar por assunto, comece por Tema. Se quer testar o que já sabe, use Simulados.",
      ctas: [
        { label: "Abrir PDF", action: "liora:open-pdf" },
        { label: "Abrir Tema", action: "liora:open-tema" },
        { label: "Abrir Simulados", action: "liora:open-simulados" }
      ]
    },
    {
      id: "o_que_e_liora",
      keywords: [
        "o que é a liora", "o que e a liora", "para que serve",
        "como funciona a liora", "o que a liora faz"
      ],
      response:
        "A Liora é uma plataforma de estudo guiado por IA. Ela te ajuda a estudar por tema, usar seus PDFs, praticar com simulados e acompanhar sua evolução no dashboard.",
      ctas: [
        { label: "Como começar", prompt: "Como começar" },
        { label: "Ver planos", action: "liora:open-pricing" }
      ]
    },
    {
      id: "explicar_pdf",
      keywords: [
        "pdf", "como usar pdf", "como funciona pdf", "apostila",
        "material", "enviar pdf", "tenho material", "tenho apostila",
        "estudar pdf", "usar pdf"
      ],
      response:
        "A função PDF é ideal para quem já tem material de estudo. Você envia o arquivo e usa a Liora para estudar de forma mais guiada a partir dele.",
      ctas: [
        { label: "Abrir PDF", action: "liora:open-pdf" }
      ]
    },
    {
      id: "explicar_tema",
      keywords: [
        "tema", "como funciona tema", "estudar por tema",
        "estudar por assunto", "assunto", "quero começar do zero",
        "quero comecar do zero", "não tenho material", "nao tenho material"
      ],
      response:
        "A função Tema é melhor quando você quer estudar um assunto específico. É uma boa opção para começar do zero, revisar um tópico ou focar em um ponto que precisa reforçar.",
      ctas: [
        { label: "Abrir Tema", action: "liora:open-tema" }
      ]
    },
    {
      id: "explicar_simulados",
      keywords: [
        "simulado", "simulados", "como funciona o simulado",
        "praticar", "treinar", "testar", "quero praticar",
        "quero treinar", "questões", "questoes"
      ],
      response:
        "Simulados servem para praticar, revisar e identificar pontos fracos. Eles funcionam melhor quando você já estudou algum conteúdo e quer testar seu desempenho.",
      ctas: [
        { label: "Abrir Simulados", action: "liora:open-simulados" }
      ]
    },
    {
      id: "explicar_dashboard",
      keywords: [
        "dashboard", "progresso", "desempenho",
        "acompanhar evolução", "acompanhar evolucao", "meu desempenho"
      ],
      response:
        "O Dashboard é a área em que você acompanha seu progresso na Liora. Ele ajuda a visualizar sua evolução e seu ritmo de estudo.",
      ctas: [
        { label: "Abrir Dashboard", action: "liora:open-dashboard" }
      ]
    },
    {
      id: "planos",
      keywords: [
        "premium", "free", "plano", "planos", "diferença", "diferenca",
        "assinar", "vale a pena", "limite", "limites", "gratuito",
        "grátis", "gratis", "plano gratuito"
      ],
      response:
        "A principal diferença entre Free e Premium está nos limites de uso e no acesso mais contínuo aos recursos. O Free é ótimo para experimentar. O Premium faz mais sentido para uma rotina de estudo consistente.",
      ctas: [
        { label: "Ver planos", action: "liora:open-pricing" }
      ]
    },
    {
      id: "pouco_tempo",
      keywords: [
        "pouco tempo", "tenho pouco tempo", "20 minutos",
        "30 minutos", "rápido", "rapido", "hoje tenho pouco tempo"
      ],
      response:
        "Se você tem pouco tempo hoje, escolha um único objetivo. Pode estudar um tema específico, revisar um PDF ou fazer um simulado curto. O importante é sair com uma sessão objetiva.",
      ctas: [
        { label: "Estudar por Tema", action: "liora:open-tema" },
        { label: "Revisar PDF", action: "liora:open-pdf" },
        { label: "Fazer Simulado", action: "liora:open-simulados" }
      ]
    },
    {
      id: "revisao",
      keywords: [
        "revisar", "revisão", "revisao", "quero revisar"
      ],
      response:
        "Para revisão, o melhor costuma ser usar Simulados ou retomar um PDF que você já estudou. Se a revisão for de um ponto específico, você também pode usar Tema.",
      ctas: [
        { label: "Abrir Simulados", action: "liora:open-simulados" },
        { label: "Abrir PDF", action: "liora:open-pdf" },
        { label: "Abrir Tema", action: "liora:open-tema" }
      ]
    },
    {
      id: "login",
      keywords: [
        "entrar", "login", "acessar", "não consigo entrar", "nao consigo entrar"
      ],
      response:
        "Se você precisa acessar sua conta, posso te levar para o fluxo de login da Liora.",
      ctas: [
        { label: "Abrir login", action: "liora:open-login" }
      ]
    },
    {
      id: "fallback",
      keywords: [],
      response:
        "Posso te ajudar a entender como a Liora funciona, escolher o melhor recurso para estudar agora, explicar Free e Premium ou te levar direto para uma área da plataforma.",
      ctas: [
        { label: "Como começar", prompt: "Como começar" },
        { label: "Como usar PDF", prompt: "Como usar PDF" },
        { label: "Ver planos", action: "liora:open-pricing" },
        { label: "Abrir Simulados", action: "liora:open-simulados" }
      ]
    }
  ];

  var els = null;
  var state = {
    memory: [],
    openedOnce: false
  };

  function getEls() {
    return {
      btn: document.getElementById("lioraAssistBtn"),
      modal: document.getElementById("lioraAssistModal"),
      close: document.getElementById("lioraAssistClose"),
      messages: document.getElementById("lioraAssistMessages"),
      form: document.getElementById("lioraAssistForm"),
      input: document.getElementById("lioraAssistInput"),
      quickActions: document.getElementById("lioraAssistQuickActions")
    };
  }

  function trackAssist(eventName, data) {
    data = data || {};
    try {
      if (typeof window.track === "function") {
        window.track(eventName, data);
      } else {
        if (typeof window.gtag === "function") window.gtag("event", eventName, data);
        if (typeof window.fbq === "function") window.fbq("trackCustom", eventName, data);
      }
    } catch (err) {}
  }

  function readAnalytics() {
    try {
      var raw = localStorage.getItem(ANALYTICS_KEY);
      if (!raw) return createEmptyAnalytics();
      var data = JSON.parse(raw);
      return normalizeAnalytics(data);
    } catch (e) {
      return createEmptyAnalytics();
    }
  }

  function createEmptyAnalytics() {
    return {
      opens: 0,
      opensByReason: {},
      gateOpens: {},
      questions: {},
      intents: {},
      ctaClicks: {},
      routes: {},
      lastUpdatedAt: 0
    };
  }

  function normalizeAnalytics(data) {
    data = data && typeof data === "object" ? data : {};
    return {
      opens: Number(data.opens || 0),
      opensByReason: data.opensByReason && typeof data.opensByReason === "object" ? data.opensByReason : {},
      gateOpens: data.gateOpens && typeof data.gateOpens === "object" ? data.gateOpens : {},
      questions: data.questions && typeof data.questions === "object" ? data.questions : {},
      intents: data.intents && typeof data.intents === "object" ? data.intents : {},
      ctaClicks: data.ctaClicks && typeof data.ctaClicks === "object" ? data.ctaClicks : {},
      routes: data.routes && typeof data.routes === "object" ? data.routes : {},
      lastUpdatedAt: Number(data.lastUpdatedAt || 0)
    };
  }

  function writeAnalytics(data) {
    try {
      data.lastUpdatedAt = Date.now();
      localStorage.setItem(ANALYTICS_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  function bumpCounter(bucketName, key) {
    if (!key) return;
    var data = readAnalytics();
    if (!data[bucketName] || typeof data[bucketName] !== "object") data[bucketName] = {};
    data[bucketName][key] = Number(data[bucketName][key] || 0) + 1;
    writeAnalytics(data);
  }

  function bumpOpen(reason) {
    var data = readAnalytics();
    data.opens = Number(data.opens || 0) + 1;
    reason = reason || "manual";
    data.opensByReason[reason] = Number(data.opensByReason[reason] || 0) + 1;
    writeAnalytics(data);
  }

  function remember(role, text, intentId) {
    state.memory.push({
      role: role,
      text: String(text || ""),
      intentId: intentId || "",
      ts: Date.now()
    });

    if (state.memory.length > MEMORY_LIMIT) {
      state.memory = state.memory.slice(-MEMORY_LIMIT);
    }
  }

  function getLastUserText() {
    for (var i = state.memory.length - 1; i >= 0; i--) {
      if (state.memory[i].role === "user") return state.memory[i].text;
    }
    return "";
  }

  function normalizeText(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactQuestion(text) {
    var t = normalizeText(text);
    if (!t) return "";
    return t.length > 80 ? t.slice(0, 80) : t;
  }

  function scoreIntent(item, normalized) {
    if (!item.keywords || !item.keywords.length) return 0;

    var score = 0;
    var j, keyword, nk;

    for (j = 0; j < item.keywords.length; j++) {
      keyword = item.keywords[j];
      nk = normalizeText(keyword);

      if (!nk) continue;

      if (normalized === nk) score += 100;
      else if (normalized.indexOf(nk) >= 0) score += 20 + nk.length;
      else {
        var words = nk.split(" ");
        var hits = 0;
        var w;

        for (w = 0; w < words.length; w++) {
          if (words[w] && normalized.indexOf(words[w]) >= 0) hits++;
        }

        if (hits > 0) score += hits * 5;
      }
    }

    return score;
  }

  function inferNextStepFromContext(text) {
    var t = normalizeText(text);

    if (t.indexOf("pdf") >= 0 || t.indexOf("material") >= 0 || t.indexOf("apostila") >= 0) {
      return [{ label: "Abrir PDF", action: "liora:open-pdf" }];
    }

    if (t.indexOf("simulado") >= 0 || t.indexOf("praticar") >= 0 || t.indexOf("revis") >= 0) {
      return [{ label: "Abrir Simulados", action: "liora:open-simulados" }];
    }

    if (t.indexOf("tema") >= 0 || t.indexOf("assunto") >= 0 || t.indexOf("começar do zero") >= 0 || t.indexOf("comecar do zero") >= 0) {
      return [{ label: "Abrir Tema", action: "liora:open-tema" }];
    }

    return [
      { label: "Abrir Tema", action: "liora:open-tema" },
      { label: "Abrir PDF", action: "liora:open-pdf" },
      { label: "Abrir Simulados", action: "liora:open-simulados" }
    ];
  }

  function contextualIntent(normalized) {
    var last = normalizeText(getLastUserText());

    if (!normalized) return null;

    if (normalized.indexOf("qual usar") >= 0 || normalized.indexOf("qual recurso") >= 0) {
      return {
        id: "contextual_escolha",
        response: "Use Tema para estudar por assunto, PDF quando você já tiver material e Simulados para praticar e revisar.",
        ctas: [
          { label: "Abrir Tema", action: "liora:open-tema" },
          { label: "Abrir PDF", action: "liora:open-pdf" },
          { label: "Abrir Simulados", action: "liora:open-simulados" }
        ]
      };
    }

    if ((normalized.indexOf("entendi") >= 0 || normalized.indexOf("ok") >= 0 || normalized.indexOf("certo") >= 0) && last) {
      return {
        id: "contextual_followup",
        response: "Perfeito. Quer que eu te leve direto para a próxima etapa?",
        ctas: inferNextStepFromContext(last)
      };
    }

    return null;
  }

  function findIntent(text) {
    var normalized = normalizeText(text);
    var contextual = contextualIntent(normalized);
    if (contextual) return contextual;

    var best = null;
    var bestScore = 0;
    var i, item, score;

    for (i = 0; i < knowledge.length; i++) {
      item = knowledge[i];
      score = scoreIntent(item, normalized);
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    }

    if (best) return best;

    for (i = 0; i < knowledge.length; i++) {
      if (knowledge[i].id === "fallback") return knowledge[i];
    }

    return knowledge[0];
  }

  function openAssist(meta) {
    meta = meta || {};

    if (!els) els = getEls();
    if (!els || !els.modal) return;

    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden", "false");

    state.openedOnce = true;

    trackAssist("liora_assist_open", {
      reason: meta.reason || "manual"
    });

    bumpOpen(meta.reason || "manual");

    if (els.messages && els.messages.dataset.booted !== "1") {
      bootAssistant();
    }

    setTimeout(function () {
      if (els.input) els.input.focus();
    }, 50);
  }

  function closeAssist() {
    if (!els || !els.modal) return;
    els.modal.classList.remove("is-open");
    els.modal.setAttribute("aria-hidden", "true");
  }

  function addMessage(text, who, ctas) {
    who = who || "bot";
    ctas = ctas || [];

    if (!els || !els.messages) return;

    var wrap = document.createElement("div");
    wrap.className = "liora-msg " + who;
    wrap.textContent = text;

    if (who === "bot" && ctas.length) {
      var actions = document.createElement("div");
      actions.className = "liora-assist-ctas";

      for (var i = 0; i < ctas.length; i++) {
        appendCTA(actions, ctas[i]);
      }

      wrap.appendChild(actions);
    }

    els.messages.appendChild(wrap);
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function appendCTA(container, cta) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "liora-assist-cta";
    btn.textContent = cta.label;

    btn.addEventListener("click", function () {
      if (cta.prompt) {
        bumpCounter("ctaClicks", "prompt:" + cta.label);
        handleUserPrompt(cta.prompt);
        return;
      }

      if (cta.action) {
        bumpCounter("ctaClicks", cta.action + "|" + cta.label);
        dispatchLioraAction(cta.action, {
          source: "assistente",
          label: cta.label
        });
      }
    });

    container.appendChild(btn);
  }

  function dispatchLioraAction(eventName, detail) {
    detail = detail || {};

    trackAssist("liora_assist_cta_click", {
      eventName: eventName,
      source: detail.source || "",
      label: detail.label || ""
    });

    var routeMap = {
      "liora:open-home": "home",
      "liora:open-tema": "tema",
      "liora:open-pdf": "pdf",
      "liora:open-simulados": "simulados",
      "liora:open-dashboard": "dashboard",
      "liora:open-pricing": "pricing",
      "liora:open-login": "login"
    };

    var messageMap = {
      "liora:open-home": "Te levando para a Home.",
      "liora:open-tema": "Abrindo a área Tema para você.",
      "liora:open-pdf": "Abrindo a área PDF para você.",
      "liora:open-simulados": "Abrindo a área de Simulados para você.",
      "liora:open-dashboard": "Abrindo o Dashboard para você.",
      "liora:open-pricing": "Abrindo os planos da Liora para você.",
      "liora:open-login": "Abrindo o login da Liora para você."
    };

    addMessage(messageMap[eventName] || "Certo. Te levando para essa área agora.", "bot");
    remember("bot", messageMap[eventName] || "Navegação", "nav");

    if (eventName === "liora:open-login") {
      setTimeout(function () {
        window.dispatchEvent(new Event("liora:open-login"));
        closeAssist();
      }, 150);
      return;
    }

    var route = routeMap[eventName];

    if (route && route !== "login") {
      bumpCounter("routes", route);
    }

    if (route) {
      setTimeout(function () {
        location.hash = "#" + route;
        closeAssist();
      }, 150);
      return;
    }

    closeAssist();
  }

  function handleUserPrompt(prompt) {
    var clean = String(prompt || "").trim();
    if (!clean) return;

    addMessage(clean, "user");
    remember("user", clean, "");

    var intent = findIntent(clean);

    trackAssist("liora_assist_question", {
      prompt: clean,
      intent: intent.id
    });

    bumpCounter("questions", compactQuestion(clean));
    bumpCounter("intents", intent.id);

    addMessage(intent.response, "bot", intent.ctas || []);
    remember("bot", intent.response, intent.id);
  }

  function bootAssistant() {
    if (!els || !els.messages) return;
    if (els.messages.dataset.booted === "1") return;

    els.messages.dataset.booted = "1";

    addMessage(
      "Posso te ajudar a entender como usar a Liora, escolher o melhor recurso para o seu momento e te levar direto para a próxima etapa.",
      "bot"
    );

    remember("bot", "Mensagem inicial", "boot");
  }

  function maybeOpenForGate(reason) {
    if (autoOpenedByGate) return;
    autoOpenedByGate = true;

    bumpCounter("gateOpens", reason || "unknown");
    openAssist({ reason: reason });

    if (reason === "premium") {
      setTimeout(function () {
        addMessage(
          "Você parece ter chegado a um limite do seu plano atual. Posso te mostrar os planos ou te ajudar a escolher outro caminho dentro da Liora.",
          "bot",
          [
            { label: "Ver planos", action: "liora:open-pricing" },
            { label: "Como começar", prompt: "Como começar" }
          ]
        );
      }, 80);
    }

    if (reason === "login") {
      setTimeout(function () {
        addMessage(
          "Para continuar, você precisa entrar na sua conta. Posso te levar para o login agora.",
          "bot",
          [
            { label: "Abrir login", action: "liora:open-login" }
          ]
        );
      }, 80);
    }
  }

  function onModalClick(e) {
    var target = e.target;
    if (target && target.matches("[data-close-assist='true']")) {
      closeAssist();
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && els && els.modal && els.modal.classList.contains("is-open")) {
      closeAssist();
    }
  }

  function onFormSubmit(e) {
    e.preventDefault();

    if (!els || !els.input) return;

    var text = els.input.value.trim();
    if (!text) return;

    handleUserPrompt(text);
    els.input.value = "";
  }

  function onQuickActionsClick(e) {
    var btn = e.target.closest("[data-assist-prompt]");
    if (!btn) return;

    var prompt = btn.getAttribute("data-assist-prompt");
    if (!prompt) return;

    bumpCounter("ctaClicks", "quick:" + prompt);
    handleUserPrompt(prompt);
  }

  function bindEvents() {
    if (!els) return;

    els.btn.addEventListener("click", function () {
      openAssist({ reason: "manual" });
    });

    if (els.close) {
      els.close.addEventListener("click", closeAssist);
    }

    els.modal.addEventListener("click", onModalClick);
    document.addEventListener("keydown", onKeyDown);
    els.form.addEventListener("submit", onFormSubmit);

    if (els.quickActions) {
      els.quickActions.addEventListener("click", onQuickActionsClick);
    }

    window.addEventListener("liora:open-assistente", function () {
      openAssist({ reason: "event" });
    });

    window.addEventListener("liora:premium-bloqueado", function () {
      maybeOpenForGate("premium");
    });

    window.addEventListener("liora:login-required", function () {
      maybeOpenForGate("login");
    });

    window.addEventListener("liora:route-changed", function () {
      autoOpenedByGate = false;
    });
  }

  function exposeDebugHelpers() {
    window.lioraAssistAnalytics = {
      read: function () {
        return readAnalytics();
      },
      reset: function () {
        localStorage.removeItem(ANALYTICS_KEY);
        return readAnalytics();
      },
      topQuestions: function () {
        return sortObjectDesc(readAnalytics().questions);
      },
      topIntents: function () {
        return sortObjectDesc(readAnalytics().intents);
      },
      topCtas: function () {
        return sortObjectDesc(readAnalytics().ctaClicks);
      },
      topRoutes: function () {
        return sortObjectDesc(readAnalytics().routes);
      }
    };
  }

  function sortObjectDesc(obj) {
    obj = obj && typeof obj === "object" ? obj : {};
    var arr = [];
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        arr.push({ key: k, count: Number(obj[k] || 0) });
      }
    }
    arr.sort(function (a, b) {
      return b.count - a.count;
    });
    return arr;
  }

  function ready() {
    els = getEls();
    if (!els.btn || !els.modal || !els.messages || !els.form || !els.input) return;
    bindEvents();
    exposeDebugHelpers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
