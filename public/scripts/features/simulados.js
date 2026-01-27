// =============================================================
// 🧠 LIORA — SIMULADOS (PRODUCT MODE)
// Versão: v2.3-PRODUCT (Liora UI)
//
// ✔ SCREEN como runtime
// ✔ MODAL apenas para configuração
// ✔ Start direto (botão principal)
// ✔ Configurar como botão padrão (sem ⚙️ dentro do simulado)
// ✔ Timer + progresso + resultado
// ✔ Questões via API (/api/gerarSimulado) + fallback mock
// ✔ Eventos canônicos (liora:*)
// ✔ Salvamento em localStorage
// ✔ Revisão com explicação (quando disponível)
// ✔ Controles Anterior/Próxima/Finalizar (padrão Liora)
// ✔ Alternativa selecionada com highlight elegante
// =============================================================

export const simulados = {
  ctx: null,

  STATE: {
    running: false,
    config: {
      banca: "FGV",
      qtd: 5,
      dificuldade: "misturado",
      tema: "",
      tempo: 20 // minutos
    },
    questoes: [],
    atual: 0,
    respostas: [], // { idx, escolha, correta, enunciado, alternativas[], corretaIndex, explicacao? }
    timer: {
      enabled: true,
      totalSec: 0,
      leftSec: 0,
      tickId: null
    }
  },

  // -----------------------------
  // INIT
  // -----------------------------
  init(ctx) {
    this.ctx = ctx;
    this.bindUI();
    this.restoreIfAny();

    console.log("📝 simulados.js v2.3 — Liora UI iniciado");
  },

  // -----------------------------
  // UI BINDINGS
  // -----------------------------
  bindUI() {
    const root = document.getElementById("screen-simulados");
    if (!root) {
      console.warn("⚠️ screen-simulados não encontrado no DOM.");
      return;
    }

   root.addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.getAttribute("data-action");
  if (!action) return;

  switch (action) {
    case "openConfig": return this.openConfig();
    case "closeConfig": return this.closeConfig();
    case "saveConfig": return this.saveConfig();

    case "startSimulado": return this.start();
    case "resumeSimulado": return this.resume();     // ✅ novo
    case "discardRun": return this.discardRun();     // ✅ novo

    case "cancelSimulado": return this.cancel();

    case "prevQuestao": return this.prev();
    case "nextQuestao": return this.next();

    case "finishSimulado": return this.finish();
    case "restartSimulado": return this.restart();
    case "reviewToggle": return this.toggleReview();
  }
});


    root.addEventListener("change", (ev) => {
      const inp = ev.target;
      if (!inp?.matches?.("input[name='alt']")) return;
      const val = Number(inp.value);
      this.pickAlternative(val);
    });

    window.addEventListener("liora:open-simulados", () => {
      this.showScreen();
    });

    window.addEventListener("liora:start-simulado", () => {
      this.showScreen();
      this.start();
    });
  },

  // -----------------------------
  // SCREEN CONTROL
  // -----------------------------
  showScreen() {
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    document.getElementById("screen-simulados")?.classList.add("active");
  },

  // -----------------------------
  // CONFIG MODAL
  // -----------------------------
  openConfig() {
    const modal = document.getElementById("sim-config");
    if (!modal) return;

    const c = this.STATE.config;
    this.setValue("sim-banca", c.banca);
    this.setValue("sim-qtd", c.qtd);
    this.setValue("sim-dificuldade", c.dificuldade);
    this.setValue("sim-tema", c.tema);
    this.setValue("sim-tempo", c.tempo);
    this.setValue("sim-timer", this.STATE.timer.enabled ? "on" : "off");

    modal.classList.add("open");
    document.body.classList.add("liora-modal-open");

    window.dispatchEvent(new CustomEvent("liora:modal-open", { detail: { id: "sim-config" } }));
  },

  closeConfig() {
    const modal = document.getElementById("sim-config");
    if (!modal) return;

    modal.classList.remove("open");
    document.body.classList.remove("liora-modal-open");

    window.dispatchEvent(new CustomEvent("liora:modal-close", { detail: { id: "sim-config" } }));
  },

  saveConfig() {
    const banca = this.getValue("sim-banca") || "FGV";
    const qtd = Number(this.getValue("sim-qtd") || 5);
    const dificuldade = this.getValue("sim-dificuldade") || "misturado";
    const tema = (this.getValue("sim-tema") || "").trim();
    const tempo = Number(this.getValue("sim-tempo") || 20);
    const timerMode = this.getValue("sim-timer") || "on";

    this.STATE.config = {
      banca,
      qtd: this.clamp(qtd, 3, 30),
      dificuldade,
      tema,
      tempo: this.clamp(tempo, 5, 180)
    };

    this.STATE.timer.enabled = timerMode === "on";
    this.persistConfig();

    this.toast("Configurações salvas.");

    this.closeConfig();
    this.renderIdle();
  },

  // -----------------------------
  // START / FLOW (API)
  // -----------------------------
  async start() {
    if (this.STATE.running) return;

    window.dispatchEvent(new CustomEvent("liora:simulado-start", { detail: { ...this.STATE.config } }));

    this.STATE.running = true;
    this.STATE.atual = 0;
    this.STATE.respostas = [];
    this.STATE.questoes = [];

    if (this.STATE.timer.enabled) {
      this.STATE.timer.totalSec = this.STATE.config.tempo * 60;
      this.STATE.timer.leftSec = this.STATE.timer.totalSec;
      this.startTimer();
    } else {
      this.stopTimer();
      this.STATE.timer.totalSec = 0;
      this.STATE.timer.leftSec = 0;
    }

    this.renderRunning();
    this.setText("sim-enunciado", "Gerando questões...");
    this.setHTML("sim-alts", `<div class="muted small">Isso pode levar alguns segundos.</div>`);
    this.renderButtonsState();

    try {
      const questoes = await this.fetchQuestoesAPI(this.STATE.config);
      if (!questoes?.length) throw new Error("API retornou vazio.");
      this.STATE.questoes = questoes;
    } catch (err) {
      console.warn("⚠️ Falha na API do simulado. Usando mock.", err);
      this.toast("Não foi possível gerar agora. Usando modo offline.");
      this.STATE.questoes = this.buildMockQuestions(this.STATE.config);
    }

    this.persistRun();
    this.renderQuestion();
  },

  pickAlternative(index) {
    if (!this.STATE.running) return;

    const q = this.STATE.questoes[this.STATE.atual];
    if (!q) return;

    const correta = index === q.corretaIndex;

    const existing = this.STATE.respostas.find((r) => r.idx === this.STATE.atual);
    const payload = {
      idx: this.STATE.atual,
      escolha: index,
      correta,
      enunciado: q.enunciado,
      alternativas: q.alternativas,
      corretaIndex: q.corretaIndex,
      explicacao: q.explicacao || ""
    };

    if (existing) Object.assign(existing, payload);
    else this.STATE.respostas.push(payload);

    this.persistRun();
    this.renderProgress();
    this.renderButtonsState();

    // Atualiza destaque visual da alternativa selecionada
    this.applySelectedAltUI();
  },

  prev() {
    if (!this.STATE.running) return;

    if (this.STATE.atual > 0) {
      this.STATE.atual -= 1;
      this.persistRun();
      this.renderQuestion();
      this.renderButtonsState();
    }
  },

  next() {
    if (!this.STATE.running) return;

    const total = this.STATE.questoes.length;
    if (this.STATE.atual < total - 1) {
      this.STATE.atual += 1;
      this.persistRun();
      this.renderQuestion();
      this.renderButtonsState();
    }
  },

  finish() {
    if (!this.STATE.running) return;

    this.STATE.running = false;
    this.stopTimer();

    const res = this.computeResult();
    this.persistResult(res);

    window.dispatchEvent(new CustomEvent("liora:simulado-finish", { detail: res }));

    this.renderResult(res);
  },

  cancel() {
    if (!this.STATE.running) {
      this.renderIdle();
      return;
    }

    this.STATE.running = false;
    this.stopTimer();
    this.clearRun();

    window.dispatchEvent(new Event("liora:simulado-cancel"));

    this.renderIdle();
    this.toast("Simulado cancelado.");
  },

  restart() {
    this.clearRun();
    this.STATE.running = false;
    this.stopTimer();

    window.dispatchEvent(new Event("liora:simulado-restart"));

    this.renderIdle();
  },

  // -----------------------------
  // TIMER
  // -----------------------------
  startTimer() {
    this.stopTimer();

    const tick = () => {
      if (!this.STATE.running) return;

      this.STATE.timer.leftSec -= 1;

      if (this.STATE.timer.leftSec <= 0) {
        this.STATE.timer.leftSec = 0;
        this.renderTimer();
        this.finish();
        return;
      }

      this.renderTimer();
      this.persistRun();
    };

    this.renderTimer();
    this.STATE.timer.tickId = window.setInterval(tick, 1000);
  },

  stopTimer() {
    if (this.STATE.timer.tickId) {
      clearInterval(this.STATE.timer.tickId);
      this.STATE.timer.tickId = null;
    }
  },

  // -----------------------------
  // RENDERING
  // -----------------------------
  renderIdle({ hasResume = false } = {}) {
  this.setHTML(
    "sim-body",
    `
    <div class="card">
      <div class="card-title">Simulado</div>
      <div class="muted">
        Configure banca, quantidade e tema (opcional).<br>
        Depois clique em <b>Iniciar</b>.
      </div>

      ${
        hasResume
          ? `
            <div class="muted small" style="margin-top:10px">
              Há um simulado em andamento salvo neste navegador.
            </div>
            <div class="sim-cta">
              <button class="btn-primary" data-action="resumeSimulado">Continuar</button>
              <button class="btn-outline" data-action="discardRun">Descartar</button>
              <button class="btn-outline" data-action="openConfig">Configurar</button>
            </div>
          `
          : `
            <div class="sim-cta">
              <button class="btn-primary" data-action="startSimulado">Iniciar simulado</button>
              <button class="btn-outline" data-action="openConfig">Configurar</button>
            </div>
          `
      }

      <div class="sim-meta">
        <div><span class="pill">Banca</span> ${this.escape(this.STATE.config.banca)}</div>
        <div><span class="pill">Questões</span> ${this.STATE.config.qtd}</div>
        <div><span class="pill">Dificuldade</span> ${this.escape(this.STATE.config.dificuldade)}</div>
        <div><span class="pill">Tema</span> ${this.escape(this.STATE.config.tema || "Livre")}</div>
        <div><span class="pill">Tempo</span> ${this.STATE.timer.enabled ? `${this.STATE.config.tempo} min` : "Sem timer"}</div>
      </div>
    </div>
  `
  );

  this.renderHeaderState({ mode: "idle" });
},

 renderRunning() {
  this.setHTML(
    "sim-body",
    `
    <div class="sim-topbar">
      <div class="sim-progress">
        <div class="muted" id="sim-progress-text">Carregando...</div>
        <div class="bar">
          <div class="bar-fill" id="sim-progress-bar" style="width:0%"></div>
        </div>
      </div>

      <div class="sim-timer ${this.STATE.timer.enabled ? "" : "hidden"}" id="sim-timer">
        <span id="sim-timer-text">--:--</span>
      </div>
    </div>

    <div class="card sim-question">
      <div class="sim-q-head">
        <div class="sim-q-label" id="sim-q-label"></div>
        <button class="btn-link small" data-action="cancelSimulado">Cancelar</button>
      </div>

      <div class="sim-enunciado" id="sim-enunciado"></div>
      <div class="sim-alts" id="sim-alts"></div>

      <div class="sim-actions">
        <button class="btn-secondary" data-action="openConfig">Configurar</button>

        <div class="spacer"></div>

        <button class="btn-secondary" data-action="prevQuestao" id="btn-prev">Anterior</button>
        <button class="btn-secondary" data-action="nextQuestao" id="btn-next">Próxima</button>
        <button class="btn-primary" data-action="finishSimulado" id="btn-finish">Finalizar</button>
      </div>
    </div>

    <div class="muted small" id="sim-hint">
      Selecione uma alternativa para liberar a próxima questão.
    </div>
  `
  );

  this.renderHeaderState({ mode: "running" });
  this.renderProgress();
  this.renderTimer();
  this.renderButtonsState();
},


  renderQuestion() {
    const q = this.STATE.questoes[this.STATE.atual];
    if (!q) return;

    this.setText("sim-q-label", `Questão ${this.STATE.atual + 1} de ${this.STATE.questoes.length}`);
    this.setText("sim-enunciado", q.enunciado);

    const saved = this.STATE.respostas.find((r) => r.idx === this.STATE.atual);
    const chosen = saved?.escolha ?? null;

    const html = q.alternativas
      .map((alt, i) => {
        const checked = chosen === i ? "checked" : "";
        const selected = chosen === i ? "selected" : "";
        const letter = String.fromCharCode(65 + i);
        return `
          <label class="sim-alt ${selected}">
            <input type="radio" name="alt" value="${i}" ${checked} />
            <div class="sim-alt-body">
              <div class="sim-alt-letter">${letter}</div>
              <div class="sim-alt-text">${this.escape(alt)}</div>
            </div>
          </label>
        `;
      })
      .join("");

    this.setHTML("sim-alts", html);

    this.renderProgress();
    this.renderButtonsState();
    this.applySelectedAltUI();
  },

  applySelectedAltUI() {
    const chosen = this.STATE.respostas.find((r) => r.idx === this.STATE.atual)?.escolha;
    const labels = document.querySelectorAll("#screen-simulados .sim-alt");
    labels.forEach((lb) => lb.classList.remove("selected"));
    if (typeof chosen === "number") {
      const target = document.querySelector(`#screen-simulados input[name="alt"][value="${chosen}"]`)?.closest(".sim-alt");
      target?.classList.add("selected");
    }
  },

  renderButtonsState() {
    const total = this.STATE.questoes.length;
    const idx = this.STATE.atual;

    const answered = this.STATE.respostas.some((r) => r.idx === idx);

    const btnPrev = document.getElementById("btn-prev");
    const btnNext = document.getElementById("btn-next");
    const btnFinish = document.getElementById("btn-finish");

    if (btnPrev) {
      btnPrev.disabled = idx <= 0;
      btnPrev.classList.toggle("disabled", btnPrev.disabled);
    }

    if (btnNext) {
      btnNext.disabled = !answered || idx >= total - 1;
      btnNext.classList.toggle("disabled", btnNext.disabled);
    }

    if (btnFinish) {
      btnFinish.disabled = this.STATE.respostas.length === 0;
      btnFinish.classList.toggle("disabled", btnFinish.disabled);
    }
  },

  renderProgress() {
    const total = this.STATE.questoes.length || 1;
    const answered = this.STATE.respostas.length;
    const pct = Math.round((answered / total) * 100);

    this.setText("sim-progress-text", `Respondidas: ${answered} / ${total}`);
    const fill = document.getElementById("sim-progress-bar");
    if (fill) fill.style.width = `${pct}%`;
  },

  renderTimer() {
    if (!this.STATE.timer.enabled) return;
    this.setText("sim-timer-text", this.formatTime(this.STATE.timer.leftSec));
  },

  renderResult(result) {
    const { total, acertos, erros, pct } = result;

    this.setHTML(
      "sim-body",
      `
      <div class="card">
        <div class="card-title">Resultado</div>

        <div class="sim-score">
          <div class="score-main">${pct}%</div>
          <div class="muted">Acertos: <b>${acertos}</b> de <b>${total}</b></div>
        </div>

        <div class="sim-meta">
          <div><span class="pill ok">Acertos</span> ${acertos}</div>
          <div><span class="pill bad">Erros</span> ${erros}</div>
          <div><span class="pill">Banca</span> ${this.escape(this.STATE.config.banca)}</div>
          <div><span class="pill">Tema</span> ${this.escape(this.STATE.config.tema || "Livre")}</div>
        </div>

        <div class="sim-cta">
          <button class="btn-primary" data-action="startSimulado">Refazer</button>
          <button class="btn-outline" data-action="restartSimulado">Zerar</button>
          <button class="btn-outline" data-action="reviewToggle">Revisão</button>
        </div>
      </div>

      <div class="card hidden" id="sim-review">
        <div class="card-title">Revisão</div>
        <div class="muted small">Respostas e alternativa correta.</div>
        <div class="sim-review-list" id="sim-review-list"></div>
      </div>
    `
    );

    this.renderHeaderState({ mode: "result" });
    this.renderReview(result);
  },

  toggleReview() {
    const el = document.getElementById("sim-review");
    if (!el) return;
    el.classList.toggle("hidden");
  },

  renderReview(result) {
    const list = document.getElementById("sim-review-list");
    if (!list) return;

    const rows = result.detalhes.map((r, i) => {
      const ok = r.correta;
      const sua = r.escolha;
      const correta = r.corretaIndex;
      const letter = (n) => String.fromCharCode(65 + n);
      const explicacao = (r.explicacao || "").trim();

      return `
        <div class="sim-review-item ${ok ? "ok" : "bad"}">
          <div class="sim-review-head">
            <div class="sim-review-q">Q${i + 1}</div>
            <div class="sim-review-badge">${ok ? "Correta" : "Incorreta"}</div>
          </div>

          <div class="sim-review-enun">${this.escape(r.enunciado)}</div>

          <div class="sim-review-ans">
            <div><b>Sua:</b> ${sua != null ? `${letter(sua)}. ${this.escape(r.alternativas[sua])}` : "—"}</div>
            <div><b>Correta:</b> ${letter(correta)}. ${this.escape(r.alternativas[correta])}</div>
          </div>

          ${explicacao ? `<div class="sim-review-exp"><b>Explicação:</b> ${this.escape(explicacao)}</div>` : ""}
        </div>
      `;
    });

    list.innerHTML = rows.join("");
  },

  renderHeaderState({ mode }) {
    const badge = document.getElementById("sim-mode");
    if (!badge) return;
  
    const map = {
      idle: "Pronto",
      running: "Em andamento",
      result: "Concluído"
    };
  
    badge.textContent = map[mode] || "Pronto";
    badge.setAttribute("data-mode", mode || "idle");
  },
    
    resume() {
      try {
        const run = JSON.parse(localStorage.getItem("liora_sim_run") || "null");
        if (!(run?.running && run?.questoes?.length)) {
          this.renderIdle({ hasResume: false });
          return;
        }
    
        this.STATE.running = true;
        this.STATE.config = run.config || this.STATE.config;
        this.STATE.questoes = run.questoes || [];
        this.STATE.atual = run.atual || 0;
        this.STATE.respostas = run.respostas || [];
    
        this.STATE.timer.enabled = run.timer?.enabled ?? this.STATE.timer.enabled;
        this.STATE.timer.totalSec = run.timer?.totalSec || 0;
        this.STATE.timer.leftSec = run.timer?.leftSec || 0;
    
        this.renderRunning();
        this.renderQuestion();
    
        if (this.STATE.timer.enabled && this.STATE.timer.leftSec > 0) {
          this.startTimer();
        }
      } catch {
        this.renderIdle({ hasResume: false });
      }
    },
    
    discardRun() {
      this.stopTimer();
      this.STATE.running = false;
      this.STATE.questoes = [];
      this.STATE.atual = 0;
      this.STATE.respostas = [];
      this.clearRun();
      this.renderIdle({ hasResume: false });
      this.toast("Simulado descartado.");
    },

  // -----------------------------
  // API
  // -----------------------------
  async fetchQuestoesAPI(config) {
    const payload = {
      banca: config.banca,
      qtd: config.qtd,
      dificuldade: config.dificuldade,
      tema: config.tema || ""
    };

    const res = await fetch("/api/gerarSimulado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} — ${txt}`);
    }

    const data = await res.json();
    const questoes = data?.questoes || [];

    return questoes
      .filter((q) => q?.enunciado && Array.isArray(q?.alternativas) && q.alternativas.length >= 4)
      .map((q) => ({
        enunciado: String(q.enunciado).trim(),
        alternativas: q.alternativas.slice(0, 4).map((a) => String(a).trim()),
        corretaIndex: Number.isInteger(q.corretaIndex) ? q.corretaIndex : 0,
        explicacao: q.explicacao ? String(q.explicacao).trim() : ""
      }));
  },

  // -----------------------------
  // MOCK (fallback)
  // -----------------------------
  buildMockQuestions(config) {
    const qtd = config.qtd || 5;
    const tema = config.tema || "Geral";
    const banca = config.banca || "FGV";

    const base = [
      {
        enunciado: `(${banca}) Em ${tema}, qual alternativa descreve melhor o objetivo de uma revisão periódica?`,
        alternativas: [
          "Aumentar complexidade sem necessidade",
          "Identificar falhas e corrigir inconsistências",
          "Evitar documentação",
          "Substituir testes por opinião"
        ],
        corretaIndex: 1,
        explicacao: "Revisões periódicas existem para encontrar problemas e melhorar consistência e qualidade."
      },
      {
        enunciado: `(${banca}) Qual é uma vantagem prática de estudar por questões (simulados)?`,
        alternativas: [
          "Ignorar teoria",
          "Treinar padrão de prova e consolidar conteúdo",
          "Garantir acerto sem revisão",
          "Evitar feedback"
        ],
        corretaIndex: 1,
        explicacao: "Simulados ajudam a consolidar conteúdo e ajustar estratégia de prova."
      }
    ];

    const out = [];
    for (let i = 0; i < qtd; i++) {
      const item = base[i % base.length];
      out.push({
        enunciado: item.enunciado,
        alternativas: [...item.alternativas],
        corretaIndex: item.corretaIndex,
        explicacao: item.explicacao || ""
      });
    }
    return out;
  },

  // -----------------------------
  // RESULTS
  // -----------------------------
  computeResult() {
    const total = this.STATE.questoes.length;
    const detalhes = [];

    for (let i = 0; i < total; i++) {
      const q = this.STATE.questoes[i];
      const r = this.STATE.respostas.find((x) => x.idx === i);

      detalhes.push({
        idx: i,
        enunciado: q.enunciado,
        alternativas: q.alternativas,
        corretaIndex: q.corretaIndex,
        explicacao: q.explicacao || "",
        escolha: r?.escolha ?? null,
        correta: r ? r.escolha === q.corretaIndex : false
      });
    }

    const acertos = detalhes.filter((d) => d.correta).length;
    const erros = total - acertos;
    const pct = total ? Math.round((acertos / total) * 100) : 0;

    return { total, acertos, erros, pct, detalhes, config: { ...this.STATE.config } };
  },

  // -----------------------------
  // STORAGE
  // -----------------------------
  persistConfig() {
    localStorage.setItem("liora_sim_config", JSON.stringify(this.STATE.config));
    localStorage.setItem("liora_sim_timer", JSON.stringify({ enabled: this.STATE.timer.enabled }));
  },

  persistRun() {
    const payload = {
      running: this.STATE.running,
      config: this.STATE.config,
      questoes: this.STATE.questoes,
      atual: this.STATE.atual,
      respostas: this.STATE.respostas,
      timer: {
        enabled: this.STATE.timer.enabled,
        totalSec: this.STATE.timer.totalSec,
        leftSec: this.STATE.timer.leftSec
      }
    };
    localStorage.setItem("liora_sim_run", JSON.stringify(payload));
  },

  persistResult(result) {
    localStorage.setItem("liora_sim_last_result", JSON.stringify(result));
    this.clearRun();
  },

  clearRun() {
    localStorage.removeItem("liora_sim_run");
  },

  restoreIfAny() {
    // 1) config
    try {
      const c = JSON.parse(localStorage.getItem("liora_sim_config") || "null");
      if (c?.qtd) this.STATE.config = { ...this.STATE.config, ...c };
    } catch {}
  
    // 2) timer flag
    try {
      const t = JSON.parse(localStorage.getItem("liora_sim_timer") || "null");
      if (typeof t?.enabled === "boolean") this.STATE.timer.enabled = t.enabled;
    } catch {}
  
    // 3) run salvo (NÃO auto-retoma)
    // Se existir, apenas marca que há "continuação" disponível.
    let hasResume = false;
    try {
      const run = JSON.parse(localStorage.getItem("liora_sim_run") || "null");
      hasResume = !!(run?.running && Array.isArray(run?.questoes) && run.questoes.length);
    } catch {}
  
    // Renderiza tela inicial (com ou sem aviso de continuação)
    this.renderIdle({ hasResume });
  },
  
    // -----------------------------
    // HELPERS
    // -----------------------------
    clamp(n, min, max) {
      const x = Number(n);
      if (Number.isNaN(x)) return min;
      return Math.max(min, Math.min(max, x));
    },
  
    getValue(id) {
      const el = document.getElementById(id);
      if (!el) return "";
      if (el.type === "checkbox") return el.checked ? "on" : "off";
      return el.value;
    },

  setValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === "checkbox") {
      el.checked = value === "on" || value === true;
      return;
    }
    el.value = value ?? "";
  },

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text ?? "";
  },

  setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html ?? "";
  },

  escape(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },

  formatTime(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  },

  toast(msg) {
    try {
      this.ctx?.ui?.toast?.(msg);
    } catch {}
    console.log("🔔", msg);
  }
};
