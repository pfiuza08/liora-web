// =============================================================
// 🧠 LIORA — SIMULADOS (PRODUCT MODE)
// Versão: v2.0-PRODUCT (screen-first)
//
// ✔ SCREEN como runtime
// ✔ MODAL apenas para configuração
// ✔ Start direto (botão principal)
// ✔ Configurar no FAB/btn secundário
// ✔ Timer + progresso + resultado
// ✔ Questões mock (trocar por API depois)
// ✔ Eventos canônicos (liora:*)
// ✔ Salvamento em localStorage
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
    respostas: [], // { idx, escolha, correta, enunciado, alternativas[], corretaIndex }
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

    // binds
    this.bindUI();
    this.restoreIfAny();

    console.log("📝 simulados.js v2.0 — Product Mode iniciado");
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

    // Delegação de eventos por data-action
    root.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      if (!action) return;

      if (action === "openConfig") this.openConfig();
      if (action === "closeConfig") this.closeConfig();
      if (action === "saveConfig") this.saveConfig();
      if (action === "startSimulado") this.start();
      if (action === "cancelSimulado") this.cancel();
      if (action === "nextQuestao") this.next();
      if (action === "finishSimulado") this.finish();
      if (action === "restartSimulado") this.restart();
      if (action === "reviewToggle") this.toggleReview();
    });

    // Seleção de alternativa
    root.addEventListener("change", (ev) => {
      const inp = ev.target;
      if (!inp?.matches?.("input[name='alt']")) return;
      const val = Number(inp.value);
      this.pickAlternative(val);
    });

    // Evento canônico: abrir simulados via sistema
    window.addEventListener("liora:open-simulados", () => {
      this.showScreen();
    });

    // Evento canônico: start externo (se quiser)
    window.addEventListener("liora:start-simulado", () => {
      this.showScreen();
      this.start();
    });
  },

  // -----------------------------
  // SCREEN CONTROL
  // -----------------------------
  showScreen() {
    // Se você já tem um roteador de screens, isso pode ser desnecessário.
    // Aqui a gente só garante que o screen está visível.
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const s = document.getElementById("screen-simulados");
    s?.classList.add("active");
  },

  // -----------------------------
  // CONFIG MODAL
  // -----------------------------
  openConfig() {
    const modal = document.getElementById("sim-config");
    if (!modal) return;

    // Prefill inputs
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
    this.toast("Configurações salvas ✅");

    this.closeConfig();
    this.renderIdle();
  },

  // -----------------------------
  // START / FLOW
  // -----------------------------
  start() {
    // Se já está rodando, ignora
    if (this.STATE.running) return;

    // Evento canônico
    window.dispatchEvent(new CustomEvent("liora:simulado-start", { detail: { ...this.STATE.config } }));

    this.STATE.running = true;
    this.STATE.atual = 0;
    this.STATE.respostas = [];
    this.STATE.questoes = this.buildMockQuestions(this.STATE.config);

    // Timer
    if (this.STATE.timer.enabled) {
      this.STATE.timer.totalSec = this.STATE.config.tempo * 60;
      this.STATE.timer.leftSec = this.STATE.timer.totalSec;
      this.startTimer();
    } else {
      this.stopTimer();
      this.STATE.timer.totalSec = 0;
      this.STATE.timer.leftSec = 0;
    }

    this.persistRun();
    this.renderRunning();
    this.renderQuestion();
  },

  pickAlternative(index) {
    if (!this.STATE.running) return;

    const q = this.STATE.questoes[this.STATE.atual];
    if (!q) return;

    const correta = index === q.corretaIndex;

    // salva ou substitui resposta na questão atual
    const existing = this.STATE.respostas.find((r) => r.idx === this.STATE.atual);
    const payload = {
      idx: this.STATE.atual,
      escolha: index,
      correta,
      enunciado: q.enunciado,
      alternativas: q.alternativas,
      corretaIndex: q.corretaIndex
    };

    if (existing) {
      Object.assign(existing, payload);
    } else {
      this.STATE.respostas.push(payload);
    }

    this.persistRun();
    this.renderProgress();
    this.renderButtonsState();
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
  renderIdle() {
    this.setHTML("sim-body", `
      <div class="card">
        <div class="card-title">Pronto para treinar? 🧠⚡</div>
        <div class="muted">
          Configure banca, quantidade e tema (opcional).<br>
          Depois é só clicar em <b>Iniciar simulado</b>.
        </div>

        <div class="sim-cta">
          <button class="btn-primary" data-action="startSimulado">Iniciar simulado</button>
          <button class="btn-ghost" data-action="openConfig">⚙️ Configurar</button>
        </div>

        <div class="sim-meta">
          <div><span class="pill">Banca</span> ${this.escape(this.STATE.config.banca)}</div>
          <div><span class="pill">Questões</span> ${this.STATE.config.qtd}</div>
          <div><span class="pill">Dificuldade</span> ${this.escape(this.STATE.config.dificuldade)}</div>
          <div><span class="pill">Tema</span> ${this.escape(this.STATE.config.tema || "Livre")}</div>
          <div><span class="pill">Timer</span> ${this.STATE.timer.enabled ? `${this.STATE.config.tempo} min` : "desligado"}</div>
        </div>
      </div>
    `);

    this.renderHeaderState({ mode: "idle" });
  },

  renderRunning() {
    this.setHTML("sim-body", `
      <div class="sim-topbar">
        <div class="sim-progress">
          <div class="muted" id="sim-progress-text">Carregando...</div>
          <div class="bar"><div class="bar-fill" id="sim-progress-bar" style="width:0%"></div></div>
        </div>

        <div class="sim-timer ${this.STATE.timer.enabled ? "" : "hidden"}" id="sim-timer">
          ⏳ <span id="sim-timer-text">--:--</span>
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
          <button class="btn-ghost" data-action="openConfig" title="Configurar">⚙️</button>

          <div class="spacer"></div>

          <button class="btn-ghost" data-action="nextQuestao" id="btn-next">Próxima →</button>
          <button class="btn-primary" data-action="finishSimulado" id="btn-finish">Finalizar</button>
        </div>
      </div>

      <div class="muted small" id="sim-hint">
        Dica: responda uma alternativa para liberar a próxima questão.
      </div>
    `);

    this.renderHeaderState({ mode: "running" });
    this.renderProgress();
    this.renderTimer();
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
        const letter = String.fromCharCode(65 + i);
        return `
          <label class="sim-alt">
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
  },

  renderButtonsState() {
    const total = this.STATE.questoes.length;
    const idx = this.STATE.atual;

    const answered = this.STATE.respostas.some((r) => r.idx === idx);

    const btnNext = document.getElementById("btn-next");
    const btnFinish = document.getElementById("btn-finish");

    if (btnNext) {
      btnNext.disabled = !answered || idx >= total - 1;
      btnNext.classList.toggle("disabled", btnNext.disabled);
    }

    if (btnFinish) {
      // liberar finalizar só quando responder pelo menos 1 questão
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
    const t = this.formatTime(this.STATE.timer.leftSec);
    this.setText("sim-timer-text", t);
  },

  renderResult(result) {
    const { total, acertos, erros, pct } = result;

    this.setHTML("sim-body", `
      <div class="card">
        <div class="card-title">Resultado 🎯</div>

        <div class="sim-score">
          <div class="score-main">${pct}%</div>
          <div class="muted">Você acertou <b>${acertos}</b> de <b>${total}</b> questões.</div>
        </div>

        <div class="sim-meta">
          <div><span class="pill ok">Acertos</span> ${acertos}</div>
          <div><span class="pill bad">Erros</span> ${erros}</div>
          <div><span class="pill">Banca</span> ${this.escape(this.STATE.config.banca)}</div>
          <div><span class="pill">Tema</span> ${this.escape(this.STATE.config.tema || "Livre")}</div>
        </div>

        <div class="sim-cta">
          <button class="btn-primary" data-action="startSimulado">Refazer agora</button>
          <button class="btn-ghost" data-action="restartSimulado">Zerar</button>
          <button class="btn-ghost" data-action="reviewToggle">Ver revisão</button>
        </div>
      </div>

      <div class="card hidden" id="sim-review">
        <div class="card-title">Revisão rápida 🧾</div>
        <div class="muted small">Mostrando suas respostas e a correta.</div>
        <div class="sim-review-list" id="sim-review-list"></div>
      </div>
    `);

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

      return `
        <div class="sim-review-item ${ok ? "ok" : "bad"}">
          <div class="sim-review-head">
            <div class="sim-review-q">Q${i + 1}</div>
            <div class="sim-review-badge">${ok ? "✅ Acertou" : "❌ Errou"}</div>
          </div>

          <div class="sim-review-enun">${this.escape(r.enunciado)}</div>

          <div class="sim-review-ans">
            <div><b>Sua:</b> ${sua != null ? `${letter(sua)}. ${this.escape(r.alternativas[sua])}` : "—"}</div>
            <div><b>Correta:</b> ${letter(correta)}. ${this.escape(r.alternativas[correta])}</div>
          </div>
        </div>
      `;
    });

    list.innerHTML = rows.join("");
  },

  renderHeaderState({ mode }) {
    // Atualiza pequenos estados no header da screen (se quiser)
    const badge = document.getElementById("sim-mode");
    if (!badge) return;

    if (mode === "idle") badge.textContent = "Pronto";
    if (mode === "running") badge.textContent = "Em andamento";
    if (mode === "result") badge.textContent = "Concluído";
  },

  // -----------------------------
  // MOCK DATA (trocar por API depois)
  // -----------------------------
  buildMockQuestions(config) {
    const qtd = config.qtd || 5;
    const tema = config.tema || "Geral";
    const banca = config.banca || "FGV";

    // base simples (mas já “com cara de sistema”)
    const base = [
      {
        enunciado: `(${banca}) Em ${tema}, qual alternativa define melhor o objetivo principal de uma revisão periódica?`,
        alternativas: [
          "Aumentar complexidade sem necessidade",
          "Identificar falhas e corrigir inconsistências",
          "Evitar documentação",
          "Substituir testes por opinião"
        ],
        corretaIndex: 1
      },
      {
        enunciado: `(${banca}) Qual é uma vantagem prática de estudar por questões (simulados)?`,
        alternativas: [
          "Ignorar o conteúdo teórico",
          "Treinar sob pressão e consolidar padrão de prova",
          "Garantir 100% de acerto sem revisão",
          "Evitar qualquer tipo de feedback"
        ],
        corretaIndex: 1
      },
      {
        enunciado: `(${banca}) O que melhor caracteriza um “erro por pressa” em prova?`,
        alternativas: [
          "Escolher com base em evidência",
          "Ler com calma e revisar",
          "Responder sem validar enunciado e pegadinhas",
          "Checar alternativas e eliminar incorretas"
        ],
        corretaIndex: 2
      },
      {
        enunciado: `(${banca}) Uma boa estratégia de tempo em simulado é:`,
        alternativas: [
          "Gastar todo o tempo na primeira questão",
          "Deixar as fáceis para o final",
          "Manter ritmo, marcar difíceis e voltar depois",
          "Não usar rascunho nunca"
        ],
        corretaIndex: 2
      },
      {
        enunciado: `(${banca}) O que é uma “pista” típica de alternativa errada?`,
        alternativas: [
          "Termos absolutos como “sempre” e “nunca”",
          "Explicação coerente e específica",
          "Conexão direta com o enunciado",
          "Consistência com o conteúdo estudado"
        ],
        corretaIndex: 0
      }
    ];

    // Repete/varia para completar qtd
    const out = [];
    for (let i = 0; i < qtd; i++) {
      const item = base[i % base.length];
      // clona para evitar referência compartilhada
      out.push({
        enunciado: item.enunciado.replace("revisão periódica", `revisão periódica (Q${i + 1})`),
        alternativas: [...item.alternativas],
        corretaIndex: item.corretaIndex
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

    // garante ordem
    for (let i = 0; i < total; i++) {
      const q = this.STATE.questoes[i];
      const r = this.STATE.respostas.find((x) => x.idx === i);

      detalhes.push({
        idx: i,
        enunciado: q.enunciado,
        alternativas: q.alternativas,
        corretaIndex: q.corretaIndex,
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
    // restore config
    try {
      const c = JSON.parse(localStorage.getItem("liora_sim_config") || "null");
      if (c?.qtd) this.STATE.config = { ...this.STATE.config, ...c };
    } catch {}

    try {
      const t = JSON.parse(localStorage.getItem("liora_sim_timer") || "null");
      if (typeof t?.enabled === "boolean") this.STATE.timer.enabled = t.enabled;
    } catch {}

    // restore run (se estava em andamento)
    try {
      const run = JSON.parse(localStorage.getItem("liora_sim_run") || "null");
      if (run?.running && run?.questoes?.length) {
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
        return;
      }
    } catch {}

    // padrão
    this.renderIdle();
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
    // se você tiver ui.toast, usa. Senão, fallback.
    try {
      this.ctx?.ui?.toast?.(msg);
    } catch {}
    console.log("🔔", msg);
  }
};
