// /scripts/features/pdf.js
export const pdf = {
  ctx: null,

  _plano: null,
  _sessoes: [],
  _idxAtual: 0,

  _currentSessaoId: null,

  // viewer runtime
  _blobUrl: null,

  // keyboard flag
  _keyboardBound: false,

  // gates UX helper (carregado sob demanda)
  _gatesUX: null,

 async init(ctx) {
  this.ctx = ctx;

  const btn = document.getElementById("btn-gerar-pdf");
  const limpar = document.getElementById("btn-limpar-pdf");

  btn?.addEventListener("click", () => this.gerarPorPdfUltraFiel());
  limpar?.addEventListener("click", () => this.limparPlano());

  // fechar viewer
  document
    .getElementById("btn-pdf-close")
    ?.addEventListener("click", () => this._closeViewer());

  const saved = this.ctx.store.get("planoPdf");
  if (saved?.sessoes?.length) this.render(saved);

  this._bindKeyboard();

  // 🔒 carrega gatesUX cedo (sem travar se falhar)
  try {
    // 1) se já existe no window, usa
    if (window.gatesUX?.explainAndRoute) {
      this._gatesUX = window.gatesUX;
    } else {
      // 2) tenta importar do core (ajuste o path se necessário)
      const mod = await import("../core/gates-ux.js");
      this._gatesUX = mod?.gatesUX || null;
      if (this._gatesUX) {
        try { window.gatesUX = this._gatesUX; } catch {}
      }
    }
  } catch (e) {
    console.warn("⚠️ gatesUX não carregou (PDF):", e);
    this._gatesUX = null;
  }

  console.log("pdf.js iniciado (Ultra Fiel + viewer + progresso + aprofundar)");
},


  // =========================================================
  // ✅ PROGRESS UI (barra com % + etapas)
  // Requer no HTML:
  // #pdf-progress, #pdf-progress-fill, #pdf-progress-pct
  // =========================================================
  _progressShow() {
    const wrap = document.getElementById("pdf-progress");
    if (!wrap) return;

    wrap.classList.remove("hidden");
    this._progressSet(0, "Iniciando…");
  },

  _progressHide() {
    const wrap = document.getElementById("pdf-progress");
    if (!wrap) return;

    wrap.classList.add("hidden");
    this._progressSet(0, "");
  },

  _progressSet(pct, text = "") {
    const fill = document.getElementById("pdf-progress-fill");
    const pctEl = document.getElementById("pdf-progress-pct");
    const status = document.getElementById("pdf-status");

    const p = Math.max(0, Math.min(100, Number(pct || 0)));

    if (fill) fill.style.width = `${p}%`;
    if (pctEl) pctEl.textContent = `${p}%`;
    if (status && text) status.textContent = text;
  },

  _progressSimulateDuringAi(startPct = 40, endPct = 86) {
    let running = true;
    let current = startPct;

    const msgs = [
      "Enviando páginas para IA…",
      "Analisando estrutura do PDF…",
      "Mapeando tópicos por seção…",
      "Montando sessões ultra fiéis…",
      "Selecionando fontes e trechos…",
      "Finalizando conteúdo e checkpoints…"
    ];

    let msgIndex = 0;

    const tick = () => {
      if (!running) return;

      // sobe com desaceleração perto do fim
      const remaining = Math.max(1, endPct - current);
      const stepBase = remaining > 18 ? 2.0 : remaining > 7 ? 1.2 : 0.6;
      const stepJitter = Math.random() * 0.9;
      const step = Math.max(0.35, stepBase * 0.6 + stepJitter);

      current = Math.min(endPct, current + step);

      // troca mensagem em ritmo suave
      if (Math.random() < 0.3) {
        msgIndex = (msgIndex + 1) % msgs.length;
      }

      this._progressSet(Math.round(current), msgs[msgIndex]);

      if (current < endPct) {
        setTimeout(tick, 430 + Math.random() * 280);
      }
    };

    setTimeout(tick, 260);

    return () => {
      running = false;
    };
  },

  // =========================================================
  // ✅ GERAR PLANO POR PDF (ULTRA FIEL)
  // ✅ trava Free: 1 PDF/dia (via ctx.limits)
  // =========================================================
  async gerarPorPdfUltraFiel() {
    const { store, ui } = this.ctx;

    const inp = document.getElementById("inp-pdf");
    const nivel = document.getElementById("sel-nivel-pdf")?.value || "iniciante";
    const finalidade = document.getElementById("sel-finalidade-pdf")?.value || "estudo";

    const file = inp?.files?.[0] || null;
    if (!file) {
      ui.error("Selecione um PDF primeiro.");
      return;
    }

    // 🔒 GATE (UX padrão): explica primeiro, depois oferece ação (sem teleporte)
    try {
      // Preferência: gates unificado (lioraGates). Fallback: gates do ctx. Fallback final: limits legado.
      const g = window.lioraGates || this.ctx?.gates || null;
    
      // 1) Se existir gate moderno, usa.
      let check =
        g?.canGeneratePdfPlan
          ? g.canGeneratePdfPlan(this.ctx?.store)
          : (g?.canGeneratePlan ? g.canGeneratePlan(this.ctx?.store, { source: "pdf" }) : null);
    
      // 2) Fallback: limits antigo (1 PDF/dia no Free)
      if (!check) {
        const isPremium = !!this.ctx?.gates?.isPremium?.();
        if (this.ctx?.limits && !isPremium) {
          const ok = !!this.ctx.limits.can?.("pdf");
          if (!ok) check = { ok: false, reason: "limit" };
        }
      }
    
      // 3) Se bloqueou, mostra mensagem e pergunta antes de abrir login/plans
      if (check && check.ok === false) {
        const blocked = await (window.gatesUX?.explainAndRoute?.({
          ctx: this.ctx,
          check,
          source: "pdf",
          statusElId: "pdf-status",
          mode: "ask", // 👈 humano: explica e só abre se a pessoa quiser
          // copy opcional (se quiser fixar o texto do PDF)
          copy: {
            body:
              (check.reason || "").toLowerCase().includes("login")
                ? "Para gerar mais planos por PDF, você precisa entrar (é rapidinho)."
                : "Você já gerou um plano por PDF hoje no modo visitante/Free. Para gerar outro, entre ou desbloqueie o Premium."
          }
        }) ?? true);
    
        if (blocked) return;
      }
    } catch (e) {
      console.warn("⚠️ Gates falhou (PDF):", e);
    }


    let stopSim = null;

    try {
      ui.loading(true, "Lendo PDF e gerando plano ultra fiel…");

      // fecha viewer se estava aberto (evita confusão)
      this._closeViewer();

      // liga barra
      this._progressShow();
      this._progressSet(3, "Preparando PDF…");

      // cria blobUrl para abrir no iframe
      this._setBlobUrl(file);

      // etapa 1: extração
      this._progressSet(10, "Extraindo texto por página…");
      const pages = await this._extractPdfPages(file, (pct) => {
        // progresso local da extração (10%..30%)
        const mapped = 10 + Math.round((pct / 100) * 20);
        this._progressSet(mapped, `Extraindo texto do PDF… (${pct}%)`);
      });

      const joinedLen = pages.reduce((acc, p) => acc + (p?.text?.length || 0), 0);
      if (joinedLen < 400) {
        throw new Error("Texto extraído insuficiente. Seu PDF pode ser escaneado (imagem).");
      }

      // etapa 2: IA
      this._progressSet(38, "Preparando envio para IA…");

      // simula progresso enquanto espera IA
      stopSim = this._progressSimulateDuringAi(40, 86);

      const res = await fetch("/api/gerarPlanoPdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nivel,
          finalidade,
          nomeArquivo: file.name,
          pages
        })
      });

      const raw = await res.text();
      let data = null;

      try {
        data = JSON.parse(raw);
      } catch {
        console.error("PDF resposta não-JSON:", raw);
        throw new Error("Servidor retornou resposta inválida (não JSON).");
      }

      if (!res.ok) {
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      }

      if (!data?.sessoes?.length) {
        throw new Error("Resposta inválida: sem sessões.");
      }

      // para simulação quando IA terminou
      if (stopSim) stopSim();
      stopSim = null;

      // etapa 3: normaliza + salva
      this._progressSet(90, "Organizando sessões…");

      data = this._normalizePlano(data, {
        tema: `PDF: ${file.name}`,
        nivel
      });

      store.set("planoPdf", data);
      store.set("planoPdfState", {
        currentId: data?.sessoes?.[0]?.id || null,
        doneIds: []
      });

      // cache do aprofundar do PDF
      store.set("planoPdfAprofCache", {});

      // etapa 4: render
      this._progressSet(96, "Renderizando conteúdo…");
      this.render(data);

      // ✅ contabiliza uso (apenas se gerou mesmo)
      try {
        if (this.ctx?.limits && !this.ctx?.gates?.isPremium?.()) {
          this.ctx.limits.hit("pdf");
        }
      } catch {}

      this._progressSet(100, "Plano gerado!");
      setTimeout(() => this._progressHide(), 700);
    } catch (e) {
      if (stopSim) stopSim();

      console.error(e);
      ui.error(e?.message || "Falha ao gerar plano por PDF.");
      this._progressHide();
    } finally {
      ui.loading(false);
    }
  },

  limparPlano() {
    const { store } = this.ctx;
    store.remove("planoPdf");
    store.remove("planoPdfState");
    store.remove("planoPdfAprofCache");

    this._plano = null;
    this._sessoes = [];
    this._idxAtual = 0;

    document.getElementById("pdf-result")?.classList.add("hidden");

    const status = document.getElementById("pdf-status");
    if (status) status.textContent = "";

    const view = document.getElementById("pdf-sessao-view");
    if (view) view.innerHTML = "";

    const lista = document.getElementById("pdf-lista-sessoes");
    if (lista) lista.innerHTML = "";

    this._closeViewer();
    this._clearBlobUrl();
    this._progressHide();

    console.log("Plano PDF removido");
  },

  render(data) {
    const result = document.getElementById("pdf-result");
    const lista = document.getElementById("pdf-lista-sessoes");
    const view = document.getElementById("pdf-sessao-view");

    if (!result || !lista || !view) return;

    this._plano = data;
    this._sessoes = Array.isArray(data?.sessoes) ? data.sessoes : [];

    result.classList.remove("hidden");
    lista.innerHTML = "";

    const st = this._getState();
    const lastId = st?.currentId || null;
    const idxLast = lastId ? this._sessoes.findIndex((s) => s?.id === lastId) : -1;
    this._idxAtual = idxLast >= 0 ? idxLast : 0;

    this._sessoes.forEach((s, i) => {
      const btn = document.createElement("button");
      btn.className = "session-item";
      btn.type = "button";
      btn.dataset.index = String(i);

      const done = this._isDone(s?.id);
      btn.textContent = (done ? "✅ " : "") + (s.titulo || `Sessão ${i + 1}`);

      btn.addEventListener("click", () => this._setCurrentIndex(i));
      lista.appendChild(btn);
    });

    this._setCurrentIndex(this._idxAtual, { silentSave: true });
    console.log("Plano PDF renderizado:", this._sessoes.length);
  },

  _setCurrentIndex(i, opts = {}) {
    const lista = document.getElementById("pdf-lista-sessoes");
    const n = this._sessoes.length;
    if (!n) return;

    const idx = Math.max(0, Math.min(n - 1, Number(i || 0)));
    this._idxAtual = idx;

    lista?.querySelectorAll(".session-item").forEach((x) => x.classList.remove("active"));
    const btn = lista?.querySelector(`.session-item[data-index="${idx}"]`);
    btn?.classList.add("active");

    const sessao = this._sessoes[idx];

    // ✅ inicia cronômetro ao ENTRAR numa sessão nova do PDF
    const sid = sessao?.id || null;
    if (sid && sid !== this._currentSessaoId) {
      this._currentSessaoId = sid;
      this.ctx?.store?.set?.("liora_session_start_ts", Date.now());
    }

    // ✅ start timer da sessão (para stats)
    try {
      this.ctx?.store?.set?.("liora_session_start_ts", Date.now());
    } catch {}

    this.renderSessao(sessao);

    if (!opts.silentSave) this._saveState({ currentId: sessao?.id });
  },

  _goPrev() {
    this._setCurrentIndex(this._idxAtual - 1);
  },

  _goNext() {
    this._setCurrentIndex(this._idxAtual + 1);
  },

  _toggleDoneCurrent() {
    const sessao = this._sessoes[this._idxAtual];
    if (!sessao?.id) return;

    const st = this._getState();
    const done = new Set(Array.isArray(st.doneIds) ? st.doneIds : []);

    const wasDone = done.has(sessao.id);

    if (wasDone) done.delete(sessao.id);
    else done.add(sessao.id);

    const isDoneNow = !wasDone;

    this._saveState({ doneIds: Array.from(done), currentId: sessao.id });

    // ✅ Se acabou de CONCLUIR, registra stats + atualiza dashboard
    if (isDoneNow) {
      try {
        const startTs = Number(this.ctx?.store?.get?.("liora_session_start_ts") || 0);
        const timeSec = startTs ? Math.max(0, Math.round((Date.now() - startTs) / 1000)) : 0;

        const plano = this.ctx?.store?.get?.("planoPdf") || null;
        const tema =
          (plano?.meta?.tema || "").trim() ||
          (plano?.tema || "").trim() ||
          "—";

        const sessaoTitle =
          (sessao?.titulo || sessao?.title || sessao?.nome || "").trim() ||
          `Sessão ${Number(this._idxAtual || 0) + 1}`;

        window.dispatchEvent(
          new CustomEvent("liora:study-session-done", {
            detail: { tema, sessao: sessaoTitle, timeSec, source: "pdf" }
          })
        );

        window.dispatchEvent(new Event("liora:dashboard-refresh"));

        // reinicia relógio
        this.ctx?.store?.set?.("liora_session_start_ts", Date.now());
      } catch (e) {
        console.warn("⚠️ Falha ao emitir liora:study-session-done (pdf)", e);
      }
    }

    this._refreshListChecks();
    this.renderSessao(sessao);
  },

  _refreshListChecks() {
    const lista = document.getElementById("pdf-lista-sessoes");
    if (!lista) return;

    const st = this._getState();
    const done = new Set(Array.isArray(st.doneIds) ? st.doneIds : []);

    lista.querySelectorAll(".session-item").forEach((btn) => {
      const idx = Number(btn.dataset.index || 0);
      const s = this._sessoes[idx];
      const isDone = done.has(s?.id);

      const title = s?.titulo || `Sessão ${idx + 1}`;
      btn.textContent = (isDone ? "✅ " : "") + title;
    });
  },

  // =========================================================
  // ✅ SESSÃO PDF
  // Conteúdo primeiro, avaliação depois
  // Toolbar + fontes clicáveis + aprofundar
  // =========================================================
  renderSessao(s) {
    const view = document.getElementById("pdf-sessao-view");
    if (!view) return;

    const titulo = s?.titulo || "Sessão";
    const objetivo = s?.objetivo || "-";

    const tempo = Number.isFinite(s?.tempoEstimadoMin) ? s.tempoEstimadoMin : null;
    const fontes = Array.isArray(s?.fontes) ? s.fontes : [];
    const checklist = Array.isArray(s?.checklist) ? s.checklist : [];
    const erros = Array.isArray(s?.errosComuns) ? s.errosComuns : [];
    const flashcards = Array.isArray(s?.flashcards) ? s.flashcards : [];
    const checkpoint = Array.isArray(s?.checkpoint) ? s.checkpoint : [];

    const c = s?.conteudo || {};
    const introducao = c?.introducao || "—";
    const conceitos = Array.isArray(c?.conceitos) ? c.conceitos : [];
    const exemplos = Array.isArray(c?.exemplos) ? c.exemplos : [];
    const aplicacoes = Array.isArray(c?.aplicacoes) ? c.aplicacoes : [];
    const resumo = Array.isArray(c?.resumoRapido) ? c.resumoRapido : [];

    const n = this._sessoes.length;
    const pos = this._idxAtual + 1;

    const prevDisabled = this._idxAtual <= 0 ? "disabled" : "";
    const nextDisabled = this._idxAtual >= n - 1 ? "disabled" : "";

    const isDone = this._isDone(s?.id);
    const btnDoneLabel = isDone ? "✅ Concluída (desmarcar)" : "Marcar como concluída";

    const tempoChip = tempo ? `<span class="chip">⏱ ${tempo} min</span>` : "";

    const listOrDash = (arr) =>
      arr.length
        ? `<ul>${arr.map((x) => `<li>${this._escapeHtml(x)}</li>`).join("")}</ul>`
        : `<p class="muted">—</p>`;

    const fontesHtml = fontes.length
      ? `
        <div class="box fontes-box">
          <div class="fontes-head">
            <b>Fontes do PDF</b>
            <span class="muted small">clique para abrir na página</span>
          </div>
          <div class="fontes-list">
            ${fontes
              .slice(0, 4)
              .map(
                (f) => `
                  <button class="fonte-item fonte-click" type="button" data-open-page="${this._escapeHtml(f?.page ?? "")}">
                    <div class="fonte-tag">Pág. ${this._escapeHtml(f?.page ?? "")}</div>
                    <div class="fonte-text">"${this._escapeHtml(f?.trecho || "")}"</div>
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      `
      : `
        <div class="box fontes-box">
          <b>Fontes do PDF</b>
          <p class="muted small">Sem fontes retornadas (isso não deveria acontecer).</p>
        </div>
      `;

    const checklistHtml = checklist.length
      ? `<div class="box"><b>Checklist</b><ul>${checklist
          .map((x) => `<li>${this._escapeHtml(x)}</li>`)
          .join("")}</ul></div>`
      : "";

    const errosHtml = erros.length
      ? `<div class="box"><b>Erros comuns</b><ul>${erros
          .map((x) => `<li>${this._escapeHtml(x)}</li>`)
          .join("")}</ul></div>`
      : "";

    const flashcardsHtml = flashcards.length
      ? `<div class="box">
          <b>Flashcards</b>
          <div class="flashcards">
            ${flashcards
              .map(
                (fc, i) => `
              <button class="flashcard" type="button" data-flashcard="${i}">
                <div class="flashcard-inner">
                  <div class="flashcard-face flashcard-front">
                    <div class="flashcard-label">Frente</div>
                    <div class="flashcard-text">${this._escapeHtml(fc?.frente || "")}</div>
                    <div class="flashcard-hint">Clique para virar</div>
                  </div>
                  <div class="flashcard-face flashcard-back">
                    <div class="flashcard-label">Verso</div>
                    <div class="flashcard-text">${this._escapeHtml(fc?.verso || "")}</div>
                    <div class="flashcard-hint">Clique para voltar</div>
                  </div>
                </div>
              </button>
            `
              )
              .join("")}
          </div>
        </div>`
      : "";

    // ✅ Conceitos com aprofundamento
    const conceitosHtml = conceitos.length
      ? `<ul class="conceitos-list">
          ${conceitos
            .map((item, ci) => {
              const sid = s?.id || `S${this._idxAtual + 1}`;
              const key = this._aprofundarKey(sid, ci);
              const cached = this._getAprofCache()?.[key] || null;

              const hint = cached ? "✅ já aprofundado" : "🔎 aprofundar";
              const btnLabel = cached ? "Ver aprofundamento" : "Aprofundar";

              return `
                <li class="conceito-item">
                  <div class="conceito-row">
                    <span class="conceito-text">${this._escapeHtml(item)}</span>
                    <button type="button"
                            class="btn-secondary btn-aprofundar"
                            data-aprof-sid="${this._escapeHtml(sid)}"
                            data-aprof-ci="${ci}"
                            title="${hint}">
                      ${btnLabel}
                    </button>
                  </div>

                  <div class="aprofundar-slot" id="pdf-aprof-slot-${sid}-${ci}">
                    ${cached ? this._renderAprof(cached) : ""}
                  </div>
                </li>
              `;
            })
            .join("")}
        </ul>`
      : `<p class="muted">—</p>`;

    const checkpointHtml = checkpoint.length
      ? `<div class="box checkpoint-box">
          <b>Checkpoint</b>
          <div class="checkpoint">
            ${checkpoint
              .map((q, qi) => {
                const tipo = q?.tipo || "mcq";
                const pergunta = this._escapeHtml(q?.pergunta || "");

                if (tipo === "mcq") {
                  const opcoes = Array.isArray(q?.opcoes) ? q.opcoes : [];
                  return `
                    <div class="cq">
                      <div class="cq-q"><span class="cq-tag">MCQ</span> ${pergunta}</div>
                      <div class="cq-opts">
                        ${opcoes
                          .map(
                            (op, oi) => `
                            <button type="button" class="cq-opt" data-q="${qi}" data-oi="${oi}">
                              ${this._escapeHtml(op)}
                            </button>
                          `
                          )
                          .join("")}
                      </div>
                      <div class="cq-feedback" id="pdf-cq-fb-${qi}"></div>
                      <button type="button" class="cq-show" data-show="${qi}" data-show-label="explicação">
                        Mostrar explicação
                      </button>
                      <div class="cq-exp" id="pdf-cq-exp-${qi}" style="display:none;">
                        ${this._escapeHtml(q?.explicacao || "")}
                      </div>
                    </div>
                  `;
                }

                return `
                  <div class="cq">
                    <div class="cq-q"><span class="cq-tag">Curta</span> ${pergunta}</div>
                    <textarea class="cq-input" id="pdf-cq-in-${qi}" placeholder="Escreva sua resposta aqui…"></textarea>
                    <div class="cq-row">
                      <button type="button" class="cq-check" data-check="${qi}">Comparar com gabarito</button>
                      <button type="button" class="cq-show" data-show="${qi}" data-show-label="gabarito">
                        Mostrar gabarito
                      </button>
                    </div>
                    <div class="cq-feedback" id="pdf-cq-fb-${qi}"></div>
                    <div class="cq-exp" id="pdf-cq-exp-${qi}" style="display:none;">
                      ${this._escapeHtml(q?.gabarito || "")}
                    </div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>`
      : "";

    view.innerHTML = `
      <div class="sessao-toolbar">
        <div class="sessao-progress">
          Sessão <b>${pos}</b> / ${n} ${tempoChip}
        </div>

        <div class="sessao-actions">
          <button class="btn-secondary" id="btn-pdf-prev" ${prevDisabled}>← Anterior</button>
          <button class="btn-secondary" id="btn-pdf-next" ${nextDisabled}>Próxima →</button>
          <button class="btn-primary" id="btn-pdf-done">${btnDoneLabel}</button>
        </div>
      </div>

      <h4>${this._escapeHtml(titulo)}</h4>
      <p class="muted"><b>Objetivo:</b> ${this._escapeHtml(objetivo)}</p>

      ${fontesHtml}

      <!-- ✅ CONTEÚDO PRIMEIRO -->
      <div class="box"><b>Introdução</b><p>${this._escapeHtml(introducao)}</p></div>
      <div class="box"><b>Conceitos (com aprofundamento)</b>${conceitosHtml}</div>
      <div class="box"><b>Exemplos</b>${listOrDash(exemplos)}</div>
      <div class="box"><b>Aplicações</b>${listOrDash(aplicacoes)}</div>
      <div class="box"><b>Resumo rápido</b>${listOrDash(resumo)}</div>

      <!-- ✅ SUPORTE -->
      ${checklistHtml}
      ${errosHtml}
      ${flashcardsHtml}

      <!-- ✅ AVALIAÇÃO POR ÚLTIMO -->
      ${checkpointHtml}
    `;

    // toolbar
    document.getElementById("btn-pdf-prev")?.addEventListener("click", () => this._goPrev());
    document.getElementById("btn-pdf-next")?.addEventListener("click", () => this._goNext());
    document.getElementById("btn-pdf-done")?.addEventListener("click", () => this._toggleDoneCurrent());

    // fontes clicáveis
    view.querySelectorAll("[data-open-page]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = Number(btn.getAttribute("data-open-page"));
        if (Number.isFinite(p) && p > 0) this._openViewerAtPage(p);
      });
    });

    // flashcards
    view.querySelectorAll("[data-flashcard]").forEach((btn) => {
      btn.addEventListener("click", () => btn.classList.toggle("flipped"));
    });

    // show/hide explicação/gabarito
    view.querySelectorAll("[data-show]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qi = btn.getAttribute("data-show");
        const label = btn.getAttribute("data-show-label") || "conteúdo";
        const el = document.getElementById(`pdf-cq-exp-${qi}`);
        if (!el) return;
        const open = el.style.display !== "none";
        el.style.display = open ? "none" : "block";
        btn.textContent = open ? `Mostrar ${label}` : `Ocultar ${label}`;
      });
    });

    // mcq feedback
    view.querySelectorAll(".cq-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qi = Number(btn.getAttribute("data-q"));
        const oi = Number(btn.getAttribute("data-oi"));
        const q = checkpoint[qi];
        const correta = Number.isFinite(q?.correta) ? q.correta : -1;

        view
          .querySelectorAll(`.cq-opt[data-q="${qi}"]`)
          .forEach((b) => b.classList.remove("selected", "right", "wrong"));

        btn.classList.add("selected");

        const fb = document.getElementById(`pdf-cq-fb-${qi}`);
        if (!fb) return;

        if (oi === correta) {
          btn.classList.add("right");
          fb.textContent = "✅ Correto!";
        } else {
          btn.classList.add("wrong");
          fb.textContent = `❌ Quase. A correta é a opção ${correta + 1}.`;
        }
      });
    });

    // curta compare
    view.querySelectorAll("[data-check]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qi = btn.getAttribute("data-check");
        const input = document.getElementById(`pdf-cq-in-${qi}`);
        const fb = document.getElementById(`pdf-cq-fb-${qi}`);
        const exp = document.getElementById(`pdf-cq-exp-${qi}`);
        if (!input || !fb || !exp) return;

        const ans = (input.value || "").trim();
        if (!ans) {
          fb.textContent = "✍️ Escreva uma resposta antes de comparar.";
          return;
        }

        exp.style.display = "block";
        fb.textContent = "✅ Compare sua resposta com o gabarito e ajuste 1 ponto se necessário.";
      });
    });

    // aprofundar bind
    view.querySelectorAll(".btn-aprofundar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const sid = btn.getAttribute("data-aprof-sid");
        const ci = Number(btn.getAttribute("data-aprof-ci"));
        if (!sid || !Number.isFinite(ci)) return;
        await this._aprofundarConceito(s, sid, ci);
      });
    });
  },

    // =========================================================
    // 🔎 Aprofundar (PDF)
    // Gate unificado (Premium + limite Free via gates/limits)
    // =========================================================
    async _aprofundarConceito(sessao, sid, ci) {
      const { store, ui } = this.ctx;
    
      const conceitoTxt =
        Array.isArray(sessao?.conteudo?.conceitos) ? sessao.conteudo.conceitos[ci] : null;
    
      if (!conceitoTxt) {
        ui.error("Conceito inválido para aprofundar.");
        return;
      }
    
      const key = this._aprofundarKey(sid, ci);
      const cache = this._getAprofCache();
      if (cache?.[key]) {
        this._toggleAprofSlot(sid, ci);
        return;
      }
    
      // ✅ Gate + UX (explica e só redireciona se a pessoa quiser)
      try {
        const g = window.lioraGates || this.ctx?.gates || null;
    
        const check =
          g?.canAprofundar
            ? g.canAprofundar(this.ctx?.store, { source: "pdf" })
            : (g?.canUseAprofundar
                ? g.canUseAprofundar(this.ctx?.store, { source: "pdf" })
                : (g?.canGeneratePlan
                    ? g.canGeneratePlan(this.ctx?.store, { source: "aprofundar" })
                    : { ok: true }
                  )
              );
    
        const ux = this._gatesUX || window.gatesUX || null;
    
        if (check && check.ok === false && ux?.explainAndRoute) {
          const blocked = await ux.explainAndRoute({
            ctx: this.ctx,
            check,
            source: "aprofundar",
            statusElId: "pdf-status",
            mode: "ask"
          });
    
          if (blocked) return;
        }
      } catch (e) {
        console.warn("⚠️ Gates falhou (Aprofundar PDF):", e);
      }
    
      const slot = document.getElementById(`pdf-aprof-slot-${sid}-${ci}`);
      if (!slot) return;
    
      try {
        slot.style.display = "block";
        slot.innerHTML = `<div class="muted small">Gerando aprofundamento…</div>`;
    
        const metaTema = this._plano?.meta?.tema || "";
        const metaNivel = this._plano?.meta?.nivel || "iniciante";
    
        const res = await fetch("/api/aprofundar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tema: metaTema,
            nivel: metaNivel,
            sessaoId: sid,
            sessaoTitulo: sessao?.titulo || "",
            conceito: conceitoTxt
          })
        });
    
        const text = await res.text();
        let data = null;
    
        try {
          data = JSON.parse(text);
        } catch {
          console.error("Aprofundar PDF não-JSON:", text);
          throw new Error("Resposta inválida do servidor (não JSON).");
        }
    
        if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
        if (!data?.topico || !data?.explicacaoLonga) {
          throw new Error("Aprofundamento inválido (faltando campos).");
        }
    
        const nextCache = { ...(cache || {}) };
        nextCache[key] = data;
        store.set("planoPdfAprofCache", nextCache);
    
        slot.innerHTML = this._renderAprof(data);
    
        // atualiza label do botão (robusto)
        const safeSid =
          window.CSS && typeof CSS.escape === "function" ? CSS.escape(sid) : this._escapeAttr(sid);
    
        const btn = document.querySelector(
          `.btn-aprofundar[data-aprof-sid="${safeSid}"][data-aprof-ci="${ci}"]`
        );
        if (btn) btn.textContent = "Ver aprofundamento";
      } catch (e) {
        console.error(e);
        slot.innerHTML = "";
        ui.error(e?.message || "Falha ao gerar aprofundamento.");
      }
    },


  _renderAprof(data) {
    const topico = this._escapeHtml(data?.topico || "Aprofundamento");
    const explicacao = this._escapeHtml(data?.explicacaoLonga || "");
    const pegadinha = this._escapeHtml(data?.pegadinha || "");
    const exemplo = Array.isArray(data?.exemploResolvido) ? data.exemploResolvido : [];
    const mini = Array.isArray(data?.miniCheck) ? data.miniCheck : [];

    const exemploHtml = exemplo.length
      ? `<div class="aprof-box">
          <b>Exemplo resolvido</b>
          <ol>${exemplo.map((x) => `<li>${this._escapeHtml(x)}</li>`).join("")}</ol>
        </div>`
      : "";

    const pegadinhaHtml = pegadinha
      ? `<div class="aprof-box">
          <b>Pegadinha comum</b>
          <p>${pegadinha}</p>
        </div>`
      : "";

    const miniHtml = mini.length
      ? `<div class="aprof-box">
          <b>Mini-check</b>
          <ul>${mini.map((x) => `<li>${this._escapeHtml(x)}</li>`).join("")}</ul>
        </div>`
      : "";

    return `
      <div class="aprof-panel">
        <div class="aprof-title">🔎 Zoom: ${topico}</div>
        <div class="aprof-box">
          <b>Explicação aprofundada</b>
          <p>${explicacao}</p>
        </div>
        ${exemploHtml}
        ${pegadinhaHtml}
        ${miniHtml}
      </div>
    `;
  },

  _toggleAprofSlot(sid, ci) {
    const slot = document.getElementById(`pdf-aprof-slot-${sid}-${ci}`);
    if (!slot) return;

    const isHidden = slot.style.display === "none" || slot.style.display === "";
    slot.style.display = isHidden ? "block" : "none";
  },

  _aprofundarKey(sessaoId, conceitoIndex) {
    return `${String(sessaoId)}::C${String(conceitoIndex)}`;
  },

  _getAprofCache() {
    return this.ctx?.store?.get("planoPdfAprofCache") || {};
  },

  // =========================================================
  // 🔒 Free limit (3 por dia) - compartilhado
  // =========================================================
  _todayKey() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  },

  _getAprofUsage() {
    return this.ctx?.store?.get("aprofUsage") || { date: this._todayKey(), used: 0, limit: 3 };
  },

  _canUseAprofFree() {
    const st = this._getAprofUsage();
    const today = this._todayKey();
    const limit = Number.isFinite(st?.limit) ? st.limit : 3;

    if (st?.date !== today) {
      const reset = { date: today, used: 0, limit };
      this.ctx.store.set("aprofUsage", reset);
      return { ok: true, used: 0, limit };
    }

    const used = Number.isFinite(st?.used) ? st.used : 0;
    return { ok: used < limit, used, limit };
  },

  _incAprofFreeUse() {
    const st = this._getAprofUsage();
    const today = this._todayKey();
    const limit = Number.isFinite(st?.limit) ? st.limit : 3;

    const used = st?.date === today ? (Number.isFinite(st.used) ? st.used : 0) : 0;

    const next = { date: today, used: used + 1, limit };
    this.ctx.store.set("aprofUsage", next);
  },

  // =========================================================
  // ===== Viewer =====
  // =========================================================
  _setBlobUrl(file) {
    this._clearBlobUrl();
    this._blobUrl = URL.createObjectURL(file);
  },

  _clearBlobUrl() {
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }
  },

  _openViewerAtPage(pageNum) {
    const wrap = document.getElementById("pdf-viewer-wrap");
    const iframe = document.getElementById("pdf-iframe");
    if (!wrap || !iframe || !this._blobUrl) return;

    wrap.classList.remove("hidden");
    iframe.src = `${this._blobUrl}#page=${pageNum}`;
  },

  _closeViewer() {
    const wrap = document.getElementById("pdf-viewer-wrap");
    const iframe = document.getElementById("pdf-iframe");
    wrap?.classList.add("hidden");
    if (iframe) iframe.src = "";
  },

  // =========================================================
  // ===== Extract pages =====
  // =========================================================
  async _extractPdfPages(file, onProgress) {
    const buf = await file.arrayBuffer();

    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.mjs";

    const loadingTask = pdfjs.getDocument({ data: buf });
    const doc = await loadingTask.promise;

    const maxPages = Math.min(doc.numPages, 20);
    const pages = [];

    let totalChars = 0;
    const maxTotalChars = 26000;

    for (let p = 1; p <= maxPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();

      const strings = content.items.map((it) => it.str).filter(Boolean);
      const text = strings.join(" ").replace(/\s+/g, " ").trim();

      if (text.length >= 40) {
        pages.push({
          page: p,
          text: text.slice(0, 5000)
        });
        totalChars += Math.min(text.length, 5000);
      }

      const pct = Math.round((p / maxPages) * 100);
      if (typeof onProgress === "function") onProgress(pct);

      if (totalChars >= maxTotalChars) break;
    }

    return pages;
  },

  // =========================================================
  // state
  // =========================================================
  _getState() {
    return this.ctx?.store?.get("planoPdfState") || { currentId: null, doneIds: [] };
  },

  _saveState(patch) {
    const st = this._getState();
    const next = {
      currentId: patch?.currentId ?? st.currentId ?? null,
      doneIds: Array.isArray(patch?.doneIds) ? patch.doneIds : (st.doneIds || [])
    };
    this.ctx.store.set("planoPdfState", next);
  },

  _isDone(id) {
    const st = this._getState();
    const done = Array.isArray(st.doneIds) ? st.doneIds : [];
    return !!id && done.includes(id);
  },

  _normalizePlano(data, fallback) {
    const meta = data?.meta || {};
    const tema = meta?.tema || fallback?.tema || "PDF";
    const nivel = meta?.nivel || fallback?.nivel || "iniciante";

    const sessoes = Array.isArray(data?.sessoes) ? data.sessoes : [];
    const sessoesNorm = sessoes.map((s, i) => ({
      id: s?.id || `S${i + 1}`,
      titulo: s?.titulo || `Sessão ${i + 1}`,
      objetivo: s?.objetivo || "",
      tempoEstimadoMin: Number.isFinite(s?.tempoEstimadoMin) ? s.tempoEstimadoMin : 20,

      fontes: Array.isArray(s?.fontes) ? s.fontes : [],
      checklist: Array.isArray(s?.checklist) ? s.checklist : [],
      errosComuns: Array.isArray(s?.errosComuns) ? s.errosComuns : [],
      flashcards: Array.isArray(s?.flashcards) ? s.flashcards : [],
      checkpoint: Array.isArray(s?.checkpoint) ? s.checkpoint : [],

      conteudo: {
        introducao: s?.conteudo?.introducao || "",
        conceitos: Array.isArray(s?.conteudo?.conceitos) ? s.conteudo.conceitos : [],
        exemplos: Array.isArray(s?.conteudo?.exemplos) ? s.conteudo.exemplos : [],
        aplicacoes: Array.isArray(s?.conteudo?.aplicacoes) ? s.conteudo.aplicacoes : [],
        resumoRapido: Array.isArray(s?.conteudo?.resumoRapido) ? s.conteudo.resumoRapido : []
      }
    }));

    return { meta: { tema, nivel }, sessoes: sessoesNorm };
  },

  _escapeHtml(value) {
    const str = String(value ?? "");
    return str
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },

  _escapeAttr(value) {
    return String(value ?? "").replaceAll('"', '\\"');
  },

  // =========================================================
  // ⌨️ Atalhos PDF
  // ← anterior | → próxima | C concluir
  // =========================================================
  _bindKeyboard() {
    if (this._keyboardBound) return;
    this._keyboardBound = true;
    window.addEventListener("keydown", (ev) => this._onKeydown(ev));
  },

  _onKeydown(ev) {
    const tag = (ev.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    const screenPdf = document.getElementById("screen-pdf");
    const isPdfActive = !!screenPdf?.classList.contains("active");
    if (!isPdfActive) return;

    if (!this._sessoes?.length) return;

    if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      this._goPrev();
      return;
    }

    if (ev.key === "ArrowRight") {
      ev.preventDefault();
      this._goNext();
      return;
    }

    if (ev.key === "c" || ev.key === "C") {
      ev.preventDefault();
      this._toggleDoneCurrent();
      return;
    }
  }
};
