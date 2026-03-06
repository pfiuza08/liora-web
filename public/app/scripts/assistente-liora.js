// =========================================================
// 🤖 Assistente da Liora — MVP
// Colar no final do JS principal
// =========================================================

(function () {
  const knowledge = [
    {
      id: "como_comecar",
      keywords: [
        "como começar", "por onde começo", "por onde comeco", "começar",
        "comecar", "estou perdido", "perdido", "início", "inicio"
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
        "o que é a liora", "o que e a liora", "para que serve", "como funciona a liora",
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
        "pdf", "como usar pdf", "como funciona pdf", "apostila", "material", "enviar pdf"
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
        "tema", "como funciona tema", "estudar por tema", "estudar por assunto", "assunto"
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
        "simulado", "simulados", "como funciona o simulado", "praticar", "treinar", "testar"
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
        "dashboard", "progresso", "desempenho", "acompanhar evolução", "acompanhar evolucao"
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
        "premium", "free", "plano", "planos", "diferença", "diferenca", "assinar",
        "vale a pena", "limite", "limites"
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
        "pouco tempo", "tenho pouco tempo", "20 minutos", "30 minutos", "rápido", "rapido"
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
        "revisar", "revisão", "revisao", "quero revisar"
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

  const els = {
    btn: document.getElementById("lioraAssistBtn"),
    modal: document.getElementById("lioraAssistModal"),
    close: document.getElementById("lioraAssistClose"),
    messages: document.getElementById("lioraAssistMessages"),
    form: document.getElementById("lioraAssistForm"),
    input: document.getElementById("lioraAssistInput"),
    quickActions: document.getElementById("lioraAssistQuickActions")
  };

  if (!els.btn || !els.modal || !els.messages || !els.form || !els.input) return;

  function trackAssist(eventName, data = {}) {
    try {
      if (typeof window.track === "function") {
        window.track(eventName, data);
      } else {
        if (typeof window.gtag === "function") window.gtag("event", eventName, data);
        if (typeof window.fbq === "function") window.fbq("trackCustom", eventName, data);
      }
    } catch (_) {}
  }

  function normalizeText(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function findIntent(text) {
    const normalized = normalizeText(text);

    for (const item of knowledge) {
      if (!item.keywords || !item.keywords.length) continue;
      const matched = item.keywords.some(keyword => normalized.includes(normalizeText(keyword)));
      if (matched) return item;
    }

    return knowledge.find(item => item.id === "fallback");
  }

  function openAssist() {
    els.modal.classList.add("is-open");
    els.modal.setAttribute("aria-hidden", "false");
    trackAssist("liora_assist_open");
    if (!els.messages.dataset.booted) {
      bootAssistant();
    }
    setTimeout(() => els.input.focus(), 50);
  }

  function closeAssist() {
    els.modal.classList.remove("is-open");
    els.modal.setAttribute("aria-hidden", "true");
  }

  function addMessage(text, who = "bot", ctas = []) {
    const wrap = document.createElement("div");
    wrap.className = `liora-msg ${who}`;
    wrap.textContent = text;

    if (who === "bot" && ctas.length) {
      const actions = document.createElement("div");
      actions.className = "liora-assist-ctas";

      ctas.forEach(cta => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "liora-assist-cta";
        btn.textContent = cta.label;

        btn.addEventListener("click", () => {
          if (cta.prompt) {
            handleUserPrompt(cta.prompt);
            return;
          }

          if (cta.action) {
            dispatchLioraAction(cta.action, { source: "assistente", label: cta.label });
          }
        });

        actions.appendChild(btn);
      });

      wrap.appendChild(actions);
    }

    els.messages.appendChild(wrap);
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function dispatchLioraAction(eventName, detail = {}) {
    trackAssist("liora_assist_cta_click", { eventName, ...detail });
    window.dispatchEvent(new CustomEvent(eventName, { detail }));

    const mapMessage = {
      "liora:open-tema": "Abrindo a área Tema para você.",
      "liora:open-pdf": "Abrindo a área PDF para você.",
      "liora:open-simulados": "Abrindo a área de Simulados para você.",
      "liora:open-dashboard": "Abrindo o Dashboard para você.",
      "liora:open-pricing": "Abrindo os planos da Liora para você."
    };

    addMessage(mapMessage[eventName] || "Certo. Te levando para essa área agora.", "bot");
    closeAssist();
  }

  function handleUserPrompt(prompt) {
    addMessage(prompt, "user");
    const intent = findIntent(prompt);
    trackAssist("liora_assist_question", { prompt, intent: intent.id });
    addMessage(intent.response, "bot", intent.ctas || []);
  }

  function bootAssistant() {
    els.messages.dataset.booted = "1";
    addMessage(
      "Posso te ajudar a entender como usar a Liora, escolher o melhor recurso para o seu momento e te levar direto para a próxima etapa.",
      "bot"
    );
  }

  els.btn.addEventListener("click", openAssist);
  els.close?.addEventListener("click", closeAssist);

  els.modal.addEventListener("click", (e) => {
    const target = e.target;
    if (target && target.matches("[data-close-assist='true']")) {
      closeAssist();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.modal.classList.contains("is-open")) {
      closeAssist();
    }
  });

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = els.input.value.trim();
    if (!text) return;
    handleUserPrompt(text);
    els.input.value = "";
  });

  els.quickActions?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-assist-prompt]");
    if (!btn) return;
    const prompt = btn.getAttribute("data-assist-prompt");
    handleUserPrompt(prompt);
  });

  // Opcional: abrir assistente por evento
  window.addEventListener("liora:open-assistente", openAssist);
})();
