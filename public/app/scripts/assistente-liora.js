// assistente-liora.js
// =========================================================
// 🤖 Assistente da Liora — MVP
// Navegação integrada ao router via location.hash
// Compatível com ambiente sem optional chaining
// =========================================================

(function () {
  var knowledge = [
    {
      id: "como_comecar",
      keywords: [
        "como começar",
        "como comecar",
        "por onde começo",
        "por onde comeco",
        "começar",
        "comecar",
        "estou perdido",
        "estou perdida",
        "perdido",
        "perdida",
        "início",
        "inicio"
      ],
      response:
        "Se você já tem material, comece por PDF.\nSe quer estudar por assunto, comece por Tema.\nSe quer testar o que já sabe, use Simulados.",
      ctas: [
        { label: "Abrir PDF", action: "liora:open-pdf" },
        { label: "Abrir Tema", action: "liora:open-tema" },
        { label: "Abrir Simulados", action: "liora:open-simulados" }
      ]
    },
    {
      id: "o_que_e_liora",
      keywords: [
        "o que é a liora",
        "o que e a liora",
        "para que serve",
        "como funciona a liora",
        "o que a liora faz"
      ],
      response:
        "A Liora é uma plataforma de estudo guiado por IA.\nEla te ajuda a estudar por tema, usar seus PDFs, praticar com simulados e acompanhar sua evolução no dashboard.",
      ctas: [
        { label: "Como começar", prompt: "Como começar" },
        { label: "Ver planos", action: "liora:open-pricing" }
      ]
    },
    {
      id: "explicar_pdf",
      keywords: [
        "pdf",
        "como usar pdf",
        "como funciona pdf",
        "apostila",
        "material",
        "enviar pdf",
        "tenho material",
        "tenho apostila"
      ],
      response:
        "A função PDF é ideal para quem já tem material de estudo.\nVocê envia o arquivo e usa a Liora para estudar de forma mais guiada a partir dele.",
      ctas: [
        { label: "Abrir PDF", action: "liora:open-pdf" }
      ]
    },
    {
      id: "explicar_tema",
      keywords: [
        "tema",
        "como funciona tema",
        "estudar por tema",
        "estudar por assunto",
        "assunto",
        "quero começar do zero",
        "quero comecar do zero",
        "não tenho material",
        "nao tenho material"
      ],
      response:
        "A função Tema é melhor quando você quer estudar um assunto específico.\nÉ uma boa opção para começar do zero, revisar um tópico ou focar em um ponto que precisa reforçar.",
      ctas: [
        { label: "Abrir Tema", action: "liora:open-tema" }
      ]
    },
    {
      id: "explicar_simulados",
      keywords: [
        "simulado",
        "simulados",
        "como funciona o simulado",
        "praticar",
        "treinar",
        "testar",
        "quero praticar",
        "quero treinar"
      ],
      response:
        "Simulados servem para praticar, revisar e identificar pontos fracos.\nEles funcionam melhor quando você já estudou algum conteúdo e quer testar seu desempenho.",
      ctas: [
        { label: "Abrir Simulados", action: "liora:open-simulados" }
      ]
    },
    {
      id: "explicar_dashboard",
      keywords: [
        "dashboard",
        "progresso",
        "desempenho",
        "acompanhar evolução",
        "acompanhar evolucao",
        "meu desempenho"
      ],
      response:
        "O Dashboard é a área em que você acompanha seu progresso na Liora.\nEle ajuda a visualizar sua evolução e seu ritmo de estudo.",
      ctas: [
        { label: "Abrir Dashboard", action: "liora:open-dashboard" }
      ]
    },
    {
      id: "planos",
      keywords: [
        "premium",
        "free",
        "plano",
        "planos",
        "diferença",
        "diferenca",
        "assinar",
        "vale a pena",
        "limite",
        "limites",
        "gratuito",
        "grátis",
        "gratis"
      ],
      response:
        "A principal diferença entre Free e Premium está nos limites de uso e no acesso mais contínuo aos recursos.\nO Free é ótimo para experimentar. O Premium faz mais sentido para uma rotina de estudo consistente.",
      ctas: [
        { label: "Ver planos", action: "liora:open-pricing" }
      ]
    },
    {
      id: "pouco_tempo",
      keywords: [
        "pouco tempo",
        "tenho pouco tempo",
        "20 minutos",
        "30 minutos",
        "rápido",
        "rapido"
      ],
      response:
        "Se você tem pouco tempo hoje, escolha um único objetivo.\nPode estudar um tema específico, revisar um PDF ou fazer um simulado curto.\nO importante é sair com uma sessão objetiva.",
      ctas: [
        { label: "Estudar por Tema", action: "liora:open-tema" },
        { label: "Revisar PDF", action: "liora:open-pdf" },
        { label: "Fazer Simulado", action: "liora:open-simulados" }
      ]
    },
    {
      id: "revisao",
      keywords: [
        "revisar",
        "revisão",
        "revisao",
        "quero revisar"
      ],
      response:
        "Para revisão, o melhor costuma ser usar Simulados ou retomar um PDF que você já estudou.\nSe a revisão for de um ponto específico, você também pode usar Tema.",
      ctas: [
        { label: "Abrir Simulados", action: "liora:open-simulados" },
        { label: "Abrir PDF", action: "liora:open-pdf" },
        { label: "Abrir Tema", action: "liora:open-tema" }
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

  function ready() {
    els = getEls();
    if (!els.btn || !els.modal || !els.messages || !els.form || !els.input) return;
    bindEvents();
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

  function normalizeText(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function findIntent(text) {
    var normalized = normalizeText(text);
    var bestItem = null;
    var bestScore = 0;
    var i, j, item, keyword, score;

    for (i = 0; i < knowledge.length; i++) {
      item = knowledge[i];
      if (!item.keywords || !item.keywords.length) continue;

      score = 0;

      for (j = 0; j < item.keywords.length; j++) {
        keyword = normalizeText(item.keywords[j]);
        if (normalized.indexOf(keyword) >= 0) {
          score = Math.max(score, keyword.length);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    if (bestItem) return bestItem;

    for (i = 0; i < knowledge.length; i++) {
      if (knowledge[i].id === "fallback") return knowledge[i];
    }

    return knowledge[0];
  }

  function openAssist() {
    if (!els) els = getEls();
    if (!els || !els.modal) return;

    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden", "false");

    trackAssist("liora_assist_open");

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

      var i;
      for (i = 0; i < ctas.length; i++) {
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
        handleUserPrompt(cta.prompt);
        return;
      }

      if (cta.action) {
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
      "liora:open-pricing": "pricing"
    };

    var messageMap = {
      "liora:open-home": "Te levando para a Home.",
      "liora:open-tema": "Abrindo a área Tema para você.",
      "liora:open-pdf": "Abrindo a área PDF para você.",
      "liora:open-simulados": "Abrindo a área de Simulados para você.",
      "liora:open-dashboard": "Abrindo o Dashboard para você.",
      "liora:open-pricing": "Abrindo os planos da Liora para você."
    };

    var route = routeMap[eventName];

    addMessage(
      messageMap[eventName] || "Certo. Te levando para essa área agora.",
      "bot"
    );

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
    addMessage(prompt, "user");

    var intent = findIntent(prompt);

    trackAssist("liora_assist_question", {
      prompt: prompt,
      intent: intent.id
    });

    addMessage(intent.response, "bot", intent.ctas || []);
  }

  function bootAssistant() {
    if (!els || !els.messages) return;
    if (els.messages.dataset.booted === "1") return;

    els.messages.dataset.booted = "1";

    addMessage(
      "Posso te ajudar a entender como usar a Liora, escolher o melhor recurso para o seu momento e te levar direto para a próxima etapa.",
      "bot"
    );
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

    handleUserPrompt(prompt);
  }

  function bindEvents() {
    if (!els) return;

    els.btn.addEventListener("click", openAssist);

    if (els.close) {
      els.close.addEventListener("click", closeAssist);
    }

    els.modal.addEventListener("click", onModalClick);
    document.addEventListener("keydown", onKeyDown);
    els.form.addEventListener("submit", onFormSubmit);

    if (els.quickActions) {
      els.quickActions.addEventListener("click", onQuickActionsClick);
    }

    window.addEventListener("liora:open-assistente", openAssist);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
