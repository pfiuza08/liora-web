// =============================================================
// 🧠 LIORA — SIMULADOS (PRODUCT MODE)
// Versão: v2.5-PRODUCT (MCQ + CE + DISC + UI polish + QA hooks)
//
// ✔ SCREEN como runtime
// ✔ MODAL apenas para configuração (robusto por JS)
// ✔ Idle mostra Continuar/Descartar quando existir run salvo
// ✔ Próxima só habilita após responder (com hint contextual)
// ✔ Botões no padrão do app (btn-primary / btn-secondary / btn-link)
// ✔ Timer + progresso + resultado + revisão com explicação
// ✔ Questões via API (/api/gerarSimulado) + fallback mock
// ✔ Suporta MCQ (4 alts) + CE (Certo/Errado, 2 alts) + DISC (textarea)
// ✔ Salvamento em localStorage
//
// 🔧 3 sugestões aplicadas (das últimas):
// 1) CE suportado no front (render + revisão + validação de corretaIndex)
// 2) "Próxima" com gating + hint que muda automaticamente
// 3) QA no console: window.lioraSimDebug() + logs leves
//
// ✅ Opção A aplicada: mescla discursivas (data.discursivas) dentro de questoes
//    para o simulado ter qtdTotal “de verdade” na UI.
// =============================================================

export const simulados = {
  ctx: null,

  STATE: {
    running: false,
    _savedRun: null, // usado só no Idle para "Continuar"
    config: {
      banca: "FGV",
      qtd: 5,
      dificuldade: "misturado",
      tema: "",
      tempo: 20 // minutos
    },
    questoes: [],
    atual: 0,
    respostas: [], // { idx, tipo, escolha?, texto?, correta?, enunciado, alternativas?, corretaIndex?, explicacao?, respostaModelo?, criterios? }
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

    // ✅ hook de QA no console
    window.lioraSimDebug = () => {
      const s = this.STATE;
      console.log("🧪 LIORA Simulados Debug");
      console.log("running:", s.running, "idx:", s.atual, "/", Math.max(0, s.questoes.length - 1));
      console.log("config:", s.config);
      console.log("timer:", s.timer);
      console.log(
        "questoes:",
        (s.questoes || []).map((q, i) => ({
          i,
          tipo: q.tipo,
          alts: q.alternativas?.length,
          corretaIndex: q.corretaIndex,
          hasModelo: !!q.respostaModelo
        }))
      );
      console.log("respostas:", s.respostas);
      console.log("answered:", s.respostas.length);
      return JSON.parse(JSON.stringify(s));
    };

    console.log("📝 simulados.js v2.5 — iniciado");
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

    // CLICKs (botões / ações)
    root.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      if (!action) return;

      switch (action) {
        case "openConfig":      return this.openConfig();
        case "closeConfig":     return this.closeConfig();
        case "saveConfig":      return this.saveConfig();

        case "startSimulado":   return this.start();
        case "resumeSimulado":  return this.resumeSimulado();
        case "discardRun":      return this.discardRun();

        case "cancelSimulado":  return this.cancel();

        case "prevQuestao":     return this.prev();
        case "nextQuestao":     return this.next();

        case "finishSimulado":  return this.finish();
        case "restartSimulado": return this.restart();
        case "reviewToggle":    return this.toggleReview();

        default:
          return;
      }
    });

    // MCQ / CE (radio)
    root.addEventListener("change", (ev) => {
      const inp = ev.target;
      if (!inp?.matches?.("input[name='alt']")) return;
      const val = Number(inp.value);
      this.pickAlternative(val);
    });

    // ✅ DISC (textarea)
    root.addEventListener("input", (ev) => {
      const ta = ev.target;
      if (!ta?.matches?.("#sim-disc-answer")) return;
      this.saveDiscAnswer(ta.value);
    });

    // Eventos canônicos
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
  // MODAL CONFIG (robusto por JS)
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

    // ✅ id correto do select do timer (no seu HTML)
    this.setValue("sim-timer-mode", this.STATE.timer.enabled ? "on" : "off");

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("liora-modal-open");

    // ✅ garantia extra caso seu CSS do modal seja parcial
    modal.style.display = "block";
    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.zIndex = "9999";

    // backdrop fecha
    const backdrop = modal.querySelector(".modal-backdrop");
    if (backdrop && !backdrop.__lioraBound) {
      backdrop.__lioraBound = true;
      backdrop.addEventListener("click", () => this.closeConfig());
    }

    window.dispatchEvent(new CustomEvent("liora:modal-open", { detail: { id: "sim-config" } }));
  },

  closeConfig() {
    const modal = document.getElementById("sim-config");
    if (!modal) return;

    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("liora-modal-open");

    // ✅ garantia extra
    modal.style.display = "none";

    window.dispatchEvent(new CustomEvent("liora:modal-close", { detail: { id: "sim-config" } }));
  },

  saveConfig() {
    const banca = this.getValue("sim-banca") || "FGV";
    const qtd = Number(this.getValue("sim-qtd") || 5);
    const dificuldade = this.getValue("sim-dificuldade") || "misturado";
    const tema = (this.getValue("sim-tema") || "").trim();
    const tempo = Number(this.getValue("sim-tempo") || 20);

    // ✅ id correto do timer
    const timerMode = this.getValue("sim-timer-mode") || "on";

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

    this.closeConfig();

    window.dispatchEvent(new CustomEvent("liora:simulado-start", { detail: { ...this.STATE.config } }));

    // reset runtime
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
    this.setHint("Carregando questões...");
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

  resumeSimulado() {
    this.closeConfig();

    let run = this.STATE._savedRun;

    if (!run) {
      try {
        run = JSON.parse(localStorage.getItem("liora_sim_run") || "null");
      } catch {
        run = null;
      }
    }

    if (!run?.questoes?.length) {
      this.toast("Não há simulado para continuar.");
      this.STATE._savedRun = null;
      this.clearRun();
      this.renderIdle();
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

    this.STATE._savedRun = null;

    this.renderRunning();
    this.renderQuestion();

    if (this.STATE.timer.enabled && this.STATE.timer.leftSec > 0) this.startTimer();
    else this.stopTimer();

    this.renderButtonsState();
  },

  discardRun() {
    this.stopTimer();
    this.clearRun();
    this.STATE._savedRun = null;

    this.STATE.running = false;
    this.STATE.questoes = [];
    this.STATE.atual = 0;
    this.STATE.respostas = [];
    this.STATE.timer.totalSec = 0;
    this.STATE.timer.leftSec = 0;

    this.closeConfig();
    this.renderIdle();
    this.toast("Simulado descartado.");
  },

  // -----------------------------
  // ANSWERS (MCQ/CE + DISC)
  // -----------------------------
  pickAlternative(index) {
    if (!this.STATE.running) return;

    const q = this.STATE.questoes[this.STATE.atual];
    if (!q) return;

    const tipo = q.tipo || ((q.alternativas?.length || 0) === 2 ? "ce" : "mcq");
    if (tipo === "disc") return;

    const correta = index === q.corretaIndex;

    const existing = this.STATE.respostas.find((r) => r.idx === this.STATE.atual);
    const payload = {
      idx: this.STATE.atual,
      tipo,
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
    this.updateHintForCurrent();
  },

  saveDiscAnswer(texto) {
    if (!this.STATE.running) return;

    const q = this.STATE.questoes[this.STATE.atual];
    if (!q) return;

    const tipo = q.tipo || "disc";
    if (tipo !== "disc") return;

    const t = String(texto || "");
    const existing = this.STATE.respostas.find((r) => r.idx === this.STATE.atual);

    const payload = {
      idx: this.STATE.atual,
      tipo: "disc",
      texto: t,
      enunciado: q.enunciado,
      respostaModelo: q.respostaModelo || "",
      criterios: Array.isArray(q.criterios) ? q.criterios : []
    };

    if (existing) Object.assign(existing, payload);
    else this.STATE.respostas.push(payload);

    this.persistRun();
    this.renderProgress();
    this.renderButtonsState();
    this.updateHintForCurrent();
  },

  isAnsweredIdx(idx) {
    const q = this.STATE.questoes[idx];
    if (!q) return false;

    const tipo = q.tipo || ((q.alternativas?.length || 0) === 2 ? "ce" : "mcq");
    const r = this.STATE.respostas.find((x) => x.idx === idx);

    if (!r) return false;

    if (tipo === "disc") {
      const t = String(r.texto || "").trim();
      return t.length >= 3;
    }

    return typeof r.escolha === "number";
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
    const idx = this.STATE.atual;

    const answered = this.isAnsweredIdx(idx);
    if (!answered) {
      this.setHint("Responda a questão para liberar a próxima.");
      this.renderButtonsState();
      return;
    }

    if (idx < total - 1) {
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

    this.closeConfig();
    this.renderResult(res);
  },

  cancel() {
    this.closeConfig();

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
    this.closeConfig();
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
    const hasRun = !!this.STATE._savedRun;

    const runMeta = (() => {
      if (!hasRun) return "";

      const r = this.STATE._savedRun;
      const total = r.questoes?.length || 0;
      const answered = r.respostas?.length || 0;
      const banca = r.config?.banca || this.STATE.config.banca;
      const tema = r.config?.tema || this.STATE.config.tema || "Livre";

      return `
        <div class="card" style="margin-bottom:12px;">
          <div class="card-title">Simulado em andamento</div>
          <div class="muted">
            Banca: <b>${this.escape(banca)}</b> · Tema: <b>${this.escape(tema)}</b><br>
            Progresso: <b>${answered}</b> / <b>${total}</b>
          </div>

          <div class="actions-row">
            <button class="btn-primary" data-action="resumeSimulado">Continuar</button>
            <button class="btn-secondary" data-action="discardRun">Descartar</button>
          </div>
        </div>
      `;
    })();

    this.setHTML(
      "sim-body",
      `
      ${runMeta}

      <div class="card">
        <div class="card-title">${hasRun ? "Novo simulado" : "Simulado"}</div>
        <div class="muted">
          Configure banca, quantidade e tema (opcional).<br>
          Depois clique em <b>${hasRun ? "Iniciar novo" : "Iniciar"}</b>.
        </div>

        <div class="actions-row">
          <button class="btn-secondary" data-action="openConfig">Configurar</button>
          <button class="btn-primary" data-action="startSimulado">${hasRun ? "Iniciar novo" : "Iniciar simulado"}</button>
        </div>

        <div class="sim-meta">
          <div><span class="chip">Banca</span> ${this.escape(this.STATE.config.banca)}</div>
          <div><span class="chip">Questões</span> ${this.STATE.config.qtd}</div>
          <div><span class="chip">Dificuldade</span> ${this.escape(this.STATE.config.dificuldade)}</div>
          <div><span class="chip">Tema</span> ${this.escape(this.STATE.config.tema || "Livre")}</div>
          <div><span class="chip">Tempo</span> ${this.STATE.timer.enabled ? `${this.STATE.config.tempo} min` : "Sem timer"}</div>
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
            <div class="sim-bar">
              <div class="sim-bar-fill" id="sim-progress-bar" style="width:0%"></div>
            </div>
          </div>

          <div class="${this.STATE.timer.enabled ? "sim-timer-pill" : "hidden"}" id="sim-timer">
            <span id="sim-timer-text">--:--</span>
          </div>
        </div>

        <div class="sim-card sim-question">
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

        <div class="muted small" id="sim-hint"></div>
      `
    );

    this.renderHeaderState({ mode: "running" });
    this.renderProgress();
    this.renderTimer();
    this.renderButtonsState();
    this.updateHintForCurrent();
  },

  // ✅ MCQ + CE + DISC
  renderQuestion() {
    const q = this.STATE.questoes[this.STATE.atual];
    if (!q) return;

    this.setText("sim-q-label", `Questão ${this.STATE.atual + 1} de ${this.STATE.questoes.length}`);
    this.setText("sim-enunciado", q.enunciado);

    const saved = this.STATE.respostas.find((r) => r.idx === this.STATE.atual);

    const tipo = q.tipo || ((q.alternativas?.length || 0) === 2 ? "ce" : "mcq");

    // DISC
    if (tipo === "disc") {
      const texto = String(saved?.texto || "");
      const criterios = Array.isArray(q.criterios) ? q.criterios : [];
      const criteriosHtml = criterios.length
        ? `<div class="muted small" style="margin-top:10px;">
             <b>Critérios (o que avaliar):</b>
             <ul style="margin:6px 0 0 18px;">
               ${criterios.slice(0, 8).map((c) => `<li>${this.escape(c)}</li>`).join("")}
             </ul>
           </div>`
        : "";

      this.setHTML(
        "sim-alts",
        `
        <div class="card" style="padding:12px;">
          <div class="muted small" style="margin-bottom:8px;">Resposta discursiva</div>
          <textarea
            id="sim-disc-answer"
            class="input"
            rows="7"
            placeholder="Digite sua resposta (rascunho)."
            style="width:100%; resize:vertical;"
          >${this.escape(texto)}</textarea>
          ${criteriosHtml}
        </div>
        `
      );

      this.renderProgress();
      this.renderButtonsState();
      this.updateHintForCurrent();
      return;
    }

    // MCQ/CE
    const chosen = saved?.escolha ?? null;
    const alts = Array.isArray(q.alternativas) ? q.alternativas : [];
    const isCE = tipo === "ce" || alts.length === 2;

    const labelsCE = ["Certo", "Errado"];

    const html = alts
      .map((alt, i) => {
        const checked = chosen === i ? "checked" : "";

        // MCQ: A/B/C/D | CE: C/E
        const letter = isCE ? (i === 0 ? "C" : "E") : String.fromCharCode(65 + i);

        // CE: texto fixo para consistência
        const text = isCE ? labelsCE[i] : this.escape(alt);

        return `
          <label class="sim-alt">
            <input type="radio" name="alt" value="${i}" ${checked} />
            <div class="sim-alt-body">
              <div class="sim-alt-letter">${letter}</div>
              <div class="sim-alt-text">${text}</div>
            </div>
          </label>
        `;
      })
      .join("");

    this.setHTML("sim-alts", html);

    this.renderProgress();
    this.renderButtonsState();
    this.updateHintForCurrent();
  },

  renderButtonsState() {
    const total = this.STATE.questoes.length;
    const idx = this.STATE.atual;

    const answered = this.isAnsweredIdx(idx);

    const btnPrev = document.getElementById("btn-prev");
    const btnNext = document.getElementById("btn-next");
    const btnFinish = document.getElementById("btn-finish");

    if (btnPrev) btnPrev.disabled = idx <= 0;
    if (btnNext) btnNext.disabled = !answered || idx >= total - 1;
    if (btnFinish) btnFinish.disabled = this.STATE.respostas.length === 0;
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
    const { totalScored, acertos, erros, pct, total, discursivasCount } = result;

    this.setHTML(
      "sim-body",
      `
      <div class="card">
        <div class="card-title">Resultado</div>

        <div class="sim-score">
          <div class="score-main">${pct}%</div>
          <div class="muted">
            Acertos: <b>${acertos}</b> de <b>${totalScored}</b>
            ${discursivasCount ? ` · Discursivas: <b>${discursivasCount}</b>` : ""}
          </div>
        </div>

        <div class="sim-meta">
          <div><span class="chip">Total</span> ${total}</div>
          <div><span class="chip">Objetivas</span> ${totalScored}</div>
          <div><span class="chip">Acertos</span> ${acertos}</div>
          <div><span class="chip">Erros</span> ${erros}</div>
          <div><span class="chip">Banca</span> ${this.escape(this.STATE.config.banca)}</div>
          <div><span class="chip">Tema</span> ${this.escape(this.STATE.config.tema || "Livre")}</div>
        </div>

        <div class="actions-row">
          <button class="btn-primary" data-action="startSimulado">Refazer</button>
          <button class="btn-secondary" data-action="restartSimulado">Zerar</button>
          <button class="btn-secondary" data-action="reviewToggle">Revisão</button>
        </div>
      </div>

      <div class="card hidden" id="sim-review">
        <div class="card-title">Revisão</div>
        <div class="muted small">Respostas, correta e feedback. Discursivas aparecem com modelo/critério.</div>
        <div class="sim-review-list" id="sim-review-list"></div>
      </div>
    `
    );

    this.renderHeaderState({ mode: "result" });
    this.renderReview(result);
  },

  // ✅ revisão compatível com CE/MCQ/DISC
  renderReview(result) {
    const list = document.getElementById("sim-review-list");
    if (!list) return;

    const rows = result.detalhes.map((r, i) => {
      const tipo = r.tipo || ((r.alternativas?.length || 0) === 2 ? "ce" : "mcq");

      // DISC
      if (tipo === "disc") {
        const texto = String(r.texto || "").trim();
        const modelo = String(r.respostaModelo || "").trim();
        const criterios = Array.isArray(r.criterios) ? r.criterios : [];

        return `
          <div class="sim-review-item">
            <div class="sim-review-head">
              <div class="sim-review-q">Q${i + 1}</div>
              <div class="sim-review-badge">Discursiva</div>
            </div>

            <div class="sim-review-enun">${this.escape(r.enunciado)}</div>

            <div class="sim-review-ans">
              <div><b>Sua resposta:</b></div>
              <div class="muted" style="white-space:pre-wrap;">${texto ? this.escape(texto) : "—"}</div>
            </div>

            ${modelo ? `
              <div class="sim-review-exp" style="margin-top:10px;">
                <b>Resposta modelo:</b>
                <div class="muted" style="white-space:pre-wrap; margin-top:4px;">${this.escape(modelo)}</div>
              </div>
            ` : ""}

            ${criterios.length ? `
              <div class="sim-review-exp" style="margin-top:10px;">
                <b>Critérios:</b>
                <ul style="margin:6px 0 0 18px;">
                  ${criterios.slice(0, 10).map((c) => `<li>${this.escape(c)}</li>`).join("")}
                </ul>
              </div>
            ` : ""}
          </div>
        `;
      }

      // MCQ/CE
      const ok = !!r.correta;
      const sua = r.escolha;
      const correta = r.corretaIndex;
      const isCE = tipo === "ce" || (r.alternativas?.length || 0) === 2;
      const explicacao = (r.explicacao || "").trim();

      const letter = (n) => {
        if (isCE) return n === 0 ? "C" : "E";
        return String.fromCharCode(65 + n);
      };

      const labelText = (n) => {
        if (n == null) return "—";
        if (isCE) return n === 0 ? "Certo" : "Errado";
        return this.escape(r.alternativas?.[n] ?? "");
      };

      return `
        <div class="sim-review-item ${ok ? "ok" : "bad"}">
          <div class="sim-review-head">
            <div class="sim-review-q">Q${i + 1}</div>
            <div class="sim-review-badge">${ok ? "Correta" : "Incorreta"}</div>
          </div>

          <div class="sim-review-enun">${this.escape(r.enunciado)}</div>

          <div class="sim-review-ans">
            <div><b>Sua:</b> ${sua != null ? `${letter(sua)}. ${labelText(sua)}` : "—"}</div>
            <div><b>Correta:</b> ${letter(correta)}. ${labelText(correta)}</div>
          </div>

          ${explicacao ? `<div class="sim-review-exp"><b>Explicação:</b> ${this.escape(explicacao)}</div>` : ""}
        </div>
      `;
    });

    list.innerHTML = rows.join("");
  },

  toggleReview() {
    const el = document.getElementById("sim-review");
    if (!el) return;
    el.classList.toggle("hidden");
  },

  renderHeaderState({ mode }) {
    const badge = document.getElementById("sim-mode");
    if (!badge) return;

    const map = { idle: "Pronto", running: "Em andamento", result: "Concluído" };
    badge.textContent = map[mode] || "Pronto";
    badge.setAttribute("data-mode", mode || "idle");
  },

  // -----------------------------
  // HINT
  // -----------------------------
  setHint(text) {
    const el = document.getElementById("sim-hint");
    if (!el) return;
    el.textContent = text || "";
  },

  updateHintForCurrent() {
    if (!this.STATE.running) return;

    const idx = this.STATE.atual;
    const total = this.STATE.questoes.length;

    const answered = this.isAnsweredIdx(idx);
    const q = this.STATE.questoes[idx];
    const tipo = q?.tipo || ((q?.alternativas?.length || 0) === 2 ? "ce" : "mcq");

    if (!answered) {
      this.setHint(tipo === "disc" ? "Digite sua resposta para liberar a próxima questão." : "Selecione uma alternativa para liberar a próxima questão.");
      return;
    }

    if (idx < total - 1) {
      this.setHint("Boa! Você já pode seguir para a próxima questão.");
      return;
    }

    this.setHint("Última questão. Quando quiser, clique em Finalizar.");
  },

  // -----------------------------
  // API
  // -----------------------------
  async fetchQuestoesAPI(config) {
    const payload = {
      banca: config.banca,
      qtd: config.qtd,
      dificuldade: config.dificuldade,
      tema: config.tema || "",

      // ✅ mix para sensação de banca
      // Regra simples: ~35% C/E e 1 discursiva quando qtd >= 8
      qtdCE: Math.max(0, Math.min(Math.floor(config.qtd * 0.35), config.qtd - 3)),
      qtdDiscursivas: config.qtd >= 8 ? 1 : 0
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

    const base = (data?.questoes || [])
      .filter((q) => q?.enunciado && Array.isArray(q?.alternativas) && q.alternativas.length >= 2)
      .map((q) => {
        const alts = q.alternativas.map((a) => String(a).trim()).filter(Boolean);
        const tipo = q.tipo || (alts.length === 2 ? "ce" : "mcq");

        const isCE = tipo === "ce" || alts.length === 2;
        const maxIdx = isCE ? 1 : 3;

        const alternativas = isCE ? alts.slice(0, 2) : alts.slice(0, 4);

        return {
          tipo: isCE ? "ce" : "mcq",
          enunciado: String(q.enunciado).trim(),
          alternativas,
          corretaIndex: Number.isInteger(q.corretaIndex)
            ? Math.max(0, Math.min(maxIdx, q.corretaIndex))
            : 0,
          explicacao: q.explicacao ? String(q.explicacao).trim() : ""
        };
      });

    // ✅ Opção A: mesclar discursivas dentro da lista de questoes
    const disc = Array.isArray(data?.discursivas) ? data.discursivas : [];
    const discMapped = disc
      .filter((d) => d && typeof d.enunciado === "string")
      .map((d) => ({
        tipo: "disc",
        enunciado: String(d.enunciado || "").trim(),
        respostaModelo: String(d.respostaModelo || "").trim(),
        criterios: Array.isArray(d.criterios) ? d.criterios.map((c) => String(c).trim()).filter(Boolean) : []
      }));

    const merged = this.mergeDiscIntoQuestions(base, discMapped);
    return merged;
  },

  mergeDiscIntoQuestions(base, discList) {
    const out = Array.isArray(base) ? [...base] : [];
    const disc = Array.isArray(discList) ? [...discList] : [];
    if (!disc.length) return out;

    // Insere cada discursiva perto do final (70% do caminho), para “cara de prova”
    disc.forEach((dq) => {
      const pos = Math.max(0, Math.min(out.length, Math.floor(out.length * 0.7)));
      out.splice(pos, 0, dq);
    });

    return out;
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
        tipo: "mcq",
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
        tipo: "mcq",
        enunciado: `(${banca}) Qual é uma vantagem prática de estudar por questões (simulados)?`,
        alternativas: [
          "Ignorar teoria",
          "Treinar padrão de prova e consolidar conteúdo",
          "Garantir acerto sem revisão",
          "Evitar feedback"
        ],
        corretaIndex: 1,
        explicacao: "Simulados ajudam a consolidar conteúdo e ajustar estratégia de prova."
      },
      {
        tipo: "ce",
        enunciado: `(${banca}) (C/E) Em ${tema}, é correto afirmar que revisar erros anteriores aumenta retenção e reduz reincidência.`,
        alternativas: ["Certo", "Errado"],
        corretaIndex: 0,
        explicacao: "Revisar erros gera feedback e reforço de pontos fracos, reduzindo repetição do erro."
      },
      {
        tipo: "disc",
        enunciado: `(${banca}) (Discursiva) Em ${tema}, explique como você aplicaria os princípios-chave para reduzir risco e aumentar conformidade.`,
        respostaModelo: "A resposta deve cobrir princípios, aplicação prática e justificativa. Deve mencionar medidas técnicas e organizacionais.",
        criterios: ["Correção conceitual", "Aplicação prática", "Clareza e objetividade", "Exemplos pertinentes"]
      }
    ];

    const out = [];
    for (let i = 0; i < qtd; i++) {
      const item = base[i % base.length];
      out.push({
        tipo: item.tipo || (item.alternativas?.length === 2 ? "ce" : "mcq"),
        enunciado: item.enunciado,
        alternativas: item.alternativas ? [...item.alternativas] : undefined,
        corretaIndex: typeof item.corretaIndex === "number" ? item.corretaIndex : undefined,
        explicacao: item.explicacao || "",
        respostaModelo: item.respostaModelo || "",
        criterios: item.criterios ? [...item.criterios] : []
      });
    }

    // Garante ao menos 1 discursiva se qtd >= 8 (para simular o mix)
    if (qtd >= 8 && !out.some((q) => q.tipo === "disc")) {
      out.splice(Math.floor(out.length * 0.7), 0, base.find((x) => x.tipo === "disc"));
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
      const tipo = q.tipo || ((q.alternativas?.length || 0) === 2 ? "ce" : "mcq");
      const r = this.STATE.respostas.find((x) => x.idx === i);

      if (tipo === "disc") {
        detalhes.push({
          idx: i,
          tipo: "disc",
          enunciado: q.enunciado,
          texto: String(r?.texto || ""),
          respostaModelo: q.respostaModelo || r?.respostaModelo || "",
          criterios: Array.isArray(q.criterios) ? q.criterios : (Array.isArray(r?.criterios) ? r.criterios : [])
        });
        continue;
      }

      detalhes.push({
        idx: i,
        tipo,
        enunciado: q.enunciado,
        alternativas: q.alternativas,
        corretaIndex: q.corretaIndex,
        explicacao: q.explicacao || "",
        escolha: r?.escolha ?? null,
        correta: r ? r.escolha === q.corretaIndex : false
      });
    }

    const scored = detalhes.filter((d) => d.tipo !== "disc");
    const totalScored = scored.length;
    const acertos = scored.filter((d) => d.correta).length;
    const erros = totalScored - acertos;
    const pct = totalScored ? Math.round((acertos / totalScored) * 100) : 0;

    const discursivasCount = detalhes.filter((d) => d.tipo === "disc").length;

    return {
      total,
      totalScored,
      discursivasCount,
      acertos,
      erros,
      pct,
      detalhes,
      config: { ...this.STATE.config }
    };
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

    // run salvo (não auto-inicia)
    try {
      const run = JSON.parse(localStorage.getItem("liora_sim_run") || "null");
      if (run?.questoes?.length) {
        this.STATE._savedRun = run;
        this.STATE.running = false;
        this.renderIdle();
        return;
      }
    } catch {}

    this.STATE._savedRun = null;
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
    try {
      this.ctx?.ui?.toast?.(msg);
    } catch {}
    console.log("🔔", msg);
  }
};

/*
✅ Fora do simulados.js: nada obrigatório.
Opcional (se quiser mais bonito): criar estilos para textarea/input dentro de .sim-card,
mas o inline style já deixa usável no MVP.
*/
