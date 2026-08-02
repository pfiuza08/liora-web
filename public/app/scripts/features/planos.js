// /scripts/features/planos.js
export const planos = {
  ctx: null,

  // estado runtime
  _plano: null,
  _idxAtual: 0,
  _sessoes: [],

  _currentSessaoId: null,

  // keyboard flag
  _keyboardBound: false,

  // gates UX helper (carregado sob demanda)
  _gatesUX: null,

  async init(ctx) {
    this.ctx = ctx;

    const btn = document.getElementById("btn-gerar-tema");
    const limpar = document.getElementById("btn-limpar-plano");
    const baixar = document.getElementById("btn-download-plano-tema");

    btn?.addEventListener("click", () => this.gerarTema());
    limpar?.addEventListener("click", () => this.limparPlano());
    baixar?.addEventListener("click", () => this.baixarPlano());

    // se existir plano salvo, renderiza
    const saved = this.ctx.store.get("planoTema");
    if (saved?.sessoes?.length) {
      this.render(saved);
    }

    this._bindKeyboard();

    // 🔒 carrega gatesUX cedo (sem travar se falhar)
    try {
      if (window.gatesUX?.explainAndRoute) {
        this._gatesUX = window.gatesUX;
      } else {
        const mod = await import("../core/gates-ux.js");
        this._gatesUX = mod?.gatesUX || null;
        if (this._gatesUX) {
          try {
            window.gatesUX = this._gatesUX;
          } catch {}
        }
      }
    } catch (e) {
      console.warn("⚠️ gatesUX não carregou (Tema):", e);
      this._gatesUX = null;
    }

    console.log("planos.js iniciado (Tema + gatesUX + aprofundar gate)");
  },

  async baixarPlano() {
    if (!this._plano?.sessoes?.length) {
      this.ctx?.ui?.error?.("Gere um plano antes de baixar o PDF.");
      return;
    }

    try {
      this.ctx?.ui?.loading?.(true, "Preparando seu plano em PDF…");
      const { exportStudyPlanPdf } = await import("../plan-pdf-export.js");
      await exportStudyPlanPdf(this._plano, { origem: "tema" });
    } catch (e) {
      console.error("Falha ao baixar plano em PDF:", e);
      this.ctx?.ui?.error?.(e?.message || "Não foi possível gerar o PDF.");
    } finally {
      this.ctx?.ui?.loading?.(false);
    }
  },

  // garante gatesUX (se init não tiver carregado por algum motivo)
  async _ensureGatesUX() {
    if (this._gatesUX?.explainAndRoute) return this._gatesUX;
    if (window.gatesUX?.explainAndRoute) {
      this._gatesUX = window.gatesUX;
      return this._gatesUX;
    }

    try {
      const mod = await import("../core/gates-ux.js");
      this._gatesUX = mod?.gatesUX || null;
      if (this._gatesUX) {
        try {
          window.gatesUX = this._gatesUX;
        } catch {}
      }
    } catch (e) {
      this._gatesUX = null;
      throw e;
    }

    return this._gatesUX;
  },

  // -----------------------------
  // 🔥 Geração por Tema (robusta)
  // ✅ com barra de progresso
  // ✅ trava Free: 3/dia (via ctx.limits)
  // -----------------------------
  async gerarTema() {
    const { store, ui } = this.ctx;

    const tema = (document.getElementById("inp-tema")?.value || "").trim();
    const nivel = document.getElementById("sel-nivel")?.value || "iniciante";
    const status = document.getElementById("tema-status");

    if (!tema) {
      ui.error("Digite um tema para gerar o plano.");
      return;
    }

    // 🔒 GATE (UX padrão): explica primeiro, depois oferece ação (sem teleporte)
    try {
      const g = window.lioraGates || this.ctx?.gates || null;
      const ux = this._gatesUX || window.gatesUX || null;

      // 1) Gate moderno (se existir)
      let check =
        g?.canGenerateTemaPlan
          ? g.canGenerateTemaPlan(this.ctx?.store)
          : (g?.canGeneratePlan ? g.canGeneratePlan(this.ctx?.store, { source: "tema" }) : null);

      // 2) Fallback: limits antigo (3/dia no Free)
      if (!check) {
        const isPremium =
          !!this.ctx?.gates?.isPremium?.() ||
          !!(this.ctx?.store?.get?.("user")?.premium);

        if (!isPremium && this.ctx?.limits?.can) {
          const ok = !!this.ctx.limits.can("tema");
          if (!ok) check = { ok: false, reason: "limit" };
        }
      }

      // 3) Se bloqueou, explica e pergunta antes de abrir login/plans
      if (check && check.ok === false) {
        const blocked = await (ux?.explainAndRoute?.({
          ctx: this.ctx,
          check,
          source: "tema",
          statusElId: "tema-status",
          mode: "ask",
          copy: {
            body:
              (check.reason || "").toLowerCase().includes("login")
                ? "Para gerar mais planos por tema, você precisa entrar (é rapidinho)."
                : "Você já gerou 3 planos por tema hoje no Free/visitante. Para gerar mais, entre ou desbloqueie o Premium."
          }
        }) ?? true);

        if (blocked) return;
      }
    } catch (e) {
      console.warn("⚠️ Gates falhou (Tema):", e);
    }

    let stopSim = null;

    try {
      ui.loading(true, "Gerando plano e sessões…");

      // ✅ barra viva desde o início
      this._progressShow();
      this._progressSet(6, "Preparando…");

      // etapa 1: chamando IA
      this._progressSet(14, "Chamando IA…");

      // ✅ simula progresso enquanto espera IA (evita sensação de travado)
      stopSim = this._progressSimulateDuringAi(16, 88);

      const res = await fetch("/api/gerarPlano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema, nivel })
      });

      const text = await res.text();
      const dataBruta = this._parseJsonResponse(text, "resposta de gerarPlano");

      if (!res.ok) {
  console.error("❌ gerarPlano falhou:", {
    statusHttpFront: res.status,
    payload: dataBruta
  });

  const detalhe =
    dataBruta?.raw ||
    dataBruta?.detail ||
    dataBruta?.error ||
    "";

  throw new Error(
    [
      dataBruta?.message || `HTTP ${res.status}`,
      dataBruta?.status ? `(OpenAI: ${dataBruta.status})` : "",
      dataBruta?.requestId ? `[requestId: ${dataBruta.requestId}]` : "",
      dataBruta?.clientRequestId ? `[clientRequestId: ${dataBruta.clientRequestId}]` : "",
      detalhe ? `→ ${String(detalhe).slice(0, 800)}` : ""
    ]
      .filter(Boolean)
      .join(" ")
  );
}

      if (!dataBruta?.sessoes?.length) {
        throw new Error("Resposta inválida: sem sessões.");
      }

      // ✅ IA terminou, para simulação
      if (stopSim) stopSim();
      stopSim = null;

      // etapa 2: normaliza + salva
      this._progressSet(92, "Organizando sessões…");

      const data = this._normalizePlano(dataBruta, { tema, nivel });

      store.set("planoTema", data);

      // reset de progresso quando gera plano novo
      this._resetStateForNewPlan(data);

      // limpa cache/uso de aprofundar do plano (não apaga contagem diária)
      this.ctx.store.set("planoTemaAprofCache", {});

      // etapa 3: render
      this._progressSet(97, "Renderizando conteúdo…");

      this.render(data);

      // ✅ contabiliza uso (apenas se gerou mesmo)
      try {
        if (this.ctx?.limits && !this.ctx?.gates?.isPremium?.()) {
          this.ctx.limits.hit("tema");
        }
      } catch {}

      // final
      this._progressSet(100, "Plano gerado!");
      if (status) status.textContent = "Plano gerado!";

      setTimeout(() => this._progressHide(), 700);
    } catch (e) {
      if (stopSim) stopSim();

      console.error("❌ Erro final gerarTema:", e);
      ui.error(e?.message || "Falha ao gerar plano por tema.");
      if (status) status.textContent = "";
      this._progressHide();
    } finally {
      ui.loading(false);
    }
  },

  limparPlano() {
    const { store } = this.ctx;
    store.remove("planoTema");
    store.remove("planoTemaState");
    store.remove("planoTemaAprofCache");

    this._plano = null;
    this._sessoes = [];
    this._idxAtual = 0;

    const result = document.getElementById("tema-result");
    result?.classList.add("hidden");

    const status = document.getElementById("tema-status");
    if (status) status.textContent = "";

    const view = document.getElementById("sessao-view");
    if (view) view.innerHTML = "";

    const lista = document.getElementById("lista-sessoes");
    if (lista) lista.innerHTML = "";

    this._progressHide();

    console.log("Plano removido");
  },

  render(data) {
    const result = document.getElementById("tema-result");
    const lista = document.getElementById("lista-sessoes");
    const view = document.getElementById("sessao-view");

    if (!result || !lista || !view) return;

    this._plano = data;
    this._sessoes = Array.isArray(data?.sessoes) ? data.sessoes : [];

    result.classList.remove("hidden");
    lista.innerHTML = "";

    // continuar de onde parou
    const st = this._getState();
    const lastId = st?.currentId || null;
    const idxLast = lastId ? this._sessoes.findIndex((s) => s?.id === lastId) : -1;
    this._idxAtual = idxLast >= 0 ? idxLast : 0;

    // render lista
    this._sessoes.forEach((s, i) => {
      const btn = document.createElement("button");
      btn.className = "session-item";
      btn.type = "button";
      btn.dataset.index = String(i);

      const done = this._isDone(s?.id);
      const prefix = done ? "✅ " : "";
      btn.textContent = prefix + (s.titulo || `Sessão ${i + 1}`);

      btn.addEventListener("click", () => this._setCurrentIndex(i));
      lista.appendChild(btn);
    });

    this._setCurrentIndex(this._idxAtual, { silentSave: true });

    console.log("Plano renderizado:", this._sessoes.length, "sessões");
  },

  // -----------------------------
  // 🧭 Navegação + Progresso
  // -----------------------------
  _setCurrentIndex(i, opts = {}) {
    const lista = document.getElementById("lista-sessoes");
    const n = this._sessoes.length;
    if (!n) return;

    const idx = Math.max(0, Math.min(n - 1, Number(i || 0)));
    this._idxAtual = idx;

    lista?.querySelectorAll(".session-item").forEach((x) => x.classList.remove("active"));

    const btn = lista?.querySelector(`.session-item[data-index="${idx}"]`);
    btn?.classList.add("active");

    const sessao = this._sessoes[idx];

    // ✅ inicia cronômetro ao ENTRAR numa sessão nova (não ao re-render)
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

    if (!opts.silentSave) {
      this._saveState({ currentId: sessao?.id });
    }
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

    // ✅ Se acabou de CONCLUIR (e não “desconcluir”), registra stats + refresh dashboard
    if (isDoneNow) {
      try {
        const startTs = Number(this.ctx?.store?.get?.("liora_session_start_ts") || 0);
        const timeSec = startTs ? Math.max(0, Math.round((Date.now() - startTs) / 1000)) : 0;

        const plano = this.ctx?.store?.get?.("planoTema") || null;
        const tema =
          (plano?.tema || "").trim() ||
          (this.ctx?.store?.get?.("temaAtual") || "").trim() ||
          "—";

        const sessaoTitle =
          (sessao?.titulo || sessao?.title || sessao?.nome || "").trim() ||
          `Sessão ${Number(this._idxAtual || 0) + 1}`;

        window.dispatchEvent(
          new CustomEvent("liora:study-session-done", {
            detail: { tema, sessao: sessaoTitle, timeSec, source: "planos" }
          })
        );

        window.dispatchEvent(new Event("liora:dashboard-refresh"));

        this.ctx?.store?.set?.("liora_session_start_ts", Date.now());
      } catch (e) {
        console.warn("⚠️ Falha ao emitir liora:study-session-done", e);
      }
    }

    this._refreshListChecks();
    this.renderSessao(sessao);
  },

  _refreshListChecks() {
    const lista = document.getElementById("lista-sessoes");
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

  // -----------------------------
  // 🧱 Render Sessão Premium
  // ✅ Conteúdo ANTES de avaliação
  // ✅ Conceitos com botão Aprofundar
  // -----------------------------
  renderSessao(s) {
    const view = document.getElementById("sessao-view");
    if (!view) return;

    const titulo = s?.titulo || "Sessão";
    const objetivo = s?.objetivo || "-";

    const tempo = Number.isFinite(s?.tempoEstimadoMin) ? s.tempoEstimadoMin : null;
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

    const listOrDash = (arr) =>
      arr.length
        ? `<ul>${arr.map((x) => `<li>${this._escapeHtml(x)}</li>`).join("")}</ul>`
        : `<p class="muted">—</p>`;

    const n = this._sessoes.length;
    const pos = this._idxAtual + 1;

    const isDone = this._isDone(s?.id);
    const btnDoneLabel = isDone ? "✅ Concluída (desmarcar)" : "Marcar como concluída";

    const prevDisabled = this._idxAtual <= 0 ? "disabled" : "";
    const nextDisabled = this._idxAtual >= n - 1 ? "disabled" : "";

    const tempoChip = tempo ? `<span class="chip">⏱ ${tempo} min</span>` : "";

    const checklistHtml = checklist.length
      ? `<div class="box">
           <b>Checklist do que dominar</b>
           <ul>${checklist.map((x) => `<li>${this._escapeHtml(x)}</li>`).join("")}</ul>
         </div>`
      : "";

    const errosHtml = erros.length
      ? `<div class="box">
           <b>Erros comuns</b>
           <ul>${erros.map((x) => `<li>${this._escapeHtml(x)}</li>`).join("")}</ul>
         </div>`
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

    const checkpointHtml = checkpoint.length
      ? `<div class="box checkpoint-box">
           <b>Checkpoint rápido</b>
           <div class="checkpoint">
             ${checkpoint
               .map((q, qi) => {
                 const tipo = q?.tipo || "mcq";
                 const pergunta = this._escapeHtml(q?.pergunta || "");

                 if (tipo === "mcq") {
                   const opcoes = Array.isArray(q?.opcoes) ? q.opcoes : [];

                   return `
                     <div class="cq" data-cq="${qi}">
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

                       <div class="cq-feedback" id="cq-fb-${qi}"></div>

                       <button type="button"
                               class="cq-show"
                               data-show="${qi}"
                               data-show-label="explicação">
                         Mostrar explicação
                       </button>

                       <div class="cq-exp" id="cq-exp-${qi}" style="display:none;">
                         ${this._escapeHtml(q?.explicacao || "")}
                       </div>
                     </div>
                   `;
                 }

                 return `
                   <div class="cq" data-cq="${qi}">
                     <div class="cq-q"><span class="cq-tag">Curta</span> ${pergunta}</div>

                     <textarea class="cq-input" id="cq-in-${qi}" placeholder="Escreva sua resposta aqui…"></textarea>

                     <div class="cq-row">
                       <button type="button" class="cq-check" data-check="${qi}">
                         Comparar com gabarito
                       </button>

                       <button type="button"
                               class="cq-show"
                               data-show="${qi}"
                               data-show-label="gabarito">
                         Mostrar gabarito
                       </button>
                     </div>

                     <div class="cq-feedback" id="cq-fb-${qi}"></div>

                     <div class="cq-exp" id="cq-exp-${qi}" style="display:none;">
                       ${this._escapeHtml(q?.gabarito || "")}
                     </div>
                   </div>
                 `;
               })
               .join("")}
           </div>
         </div>`
      : "";

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

                  <div class="aprofundar-slot" id="aprof-slot-${sid}-${ci}">
                    ${cached ? this._renderAprof(cached) : ""}
                  </div>
                </li>
              `;
            })
            .join("")}
        </ul>`
      : `<p class="muted">—</p>`;

    view.innerHTML = `
      <div class="sessao-toolbar">
        <div class="sessao-progress">
          Sessão <b>${pos}</b> / ${n} ${tempoChip}
        </div>

        <div class="sessao-actions">
          <button class="btn-secondary" id="btn-prev-sessao" ${prevDisabled}>← Anterior</button>
          <button class="btn-secondary" id="btn-next-sessao" ${nextDisabled}>Próxima →</button>
          <button class="btn-primary" id="btn-done-sessao">${btnDoneLabel}</button>
        </div>
      </div>

      <h4>${this._escapeHtml(titulo)}</h4>
      <p class="muted"><b>Objetivo:</b> ${this._escapeHtml(objetivo)}</p>

      <div class="box">
        <b>Introdução</b>
        <p>${this._escapeHtml(introducao)}</p>
      </div>

      <div class="box">
        <b>Conceitos (com aprofundamento)</b>
        ${conceitosHtml}
      </div>

      <div class="box">
        <b>Exemplos</b>
        ${listOrDash(exemplos)}
      </div>

      <div class="box">
        <b>Aplicações</b>
        ${listOrDash(aplicacoes)}
      </div>

      <div class="box">
        <b>Resumo rápido</b>
        ${listOrDash(resumo)}
      </div>

      ${checklistHtml}
      ${errosHtml}
      ${flashcardsHtml}

      ${checkpointHtml}
    `;

    document.getElementById("btn-prev-sessao")?.addEventListener("click", () => this._goPrev());
    document.getElementById("btn-next-sessao")?.addEventListener("click", () => this._goNext());
    document.getElementById("btn-done-sessao")?.addEventListener("click", () => this._toggleDoneCurrent());

    view.querySelectorAll("[data-flashcard]").forEach((btn) => {
      btn.addEventListener("click", () => btn.classList.toggle("flipped"));
    });

    view.querySelectorAll("[data-show]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qi = btn.getAttribute("data-show");
        const label = btn.getAttribute("data-show-label") || "conteúdo";
        const el = document.getElementById(`cq-exp-${qi}`);
        if (!el) return;

        const open = el.style.display !== "none";
        el.style.display = open ? "none" : "block";
        btn.textContent = open ? `Mostrar ${label}` : `Ocultar ${label}`;
      });
    });

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

        const fb = document.getElementById(`cq-fb-${qi}`);
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

    view.querySelectorAll("[data-check]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qi = btn.getAttribute("data-check");
        const input = document.getElementById(`cq-in-${qi}`);
        const fb = document.getElementById(`cq-fb-${qi}`);
        const exp = document.getElementById(`cq-exp-${qi}`);

        if (!input || !fb || !exp) return;

        const userAns = (input.value || "").trim();
        if (!userAns) {
          fb.textContent = "✍️ Escreva uma resposta (mesmo curta) antes de comparar.";
          return;
        }

        exp.style.display = "block";
        fb.textContent = "✅ Ótimo. Compare sua resposta com o gabarito e ajuste 1 ponto se necessário.";
      });
    });

    view.querySelectorAll(".btn-aprofundar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const sid = btn.getAttribute("data-aprof-sid");
        const ci = Number(btn.getAttribute("data-aprof-ci"));
        if (!sid || !Number.isFinite(ci)) return;
        await this._aprofundarConceito(s, sid, ci);
      });
    });
  },

  // -----------------------------
  // 🔎 Aprofundar (com Gate UX "ask")
  // -----------------------------
  async _aprofundarConceito(sessao, sid, ci) {
    const { store, ui } = this.ctx;

    const conceitoTxt =
      Array.isArray(sessao?.conteudo?.conceitos) ? sessao.conteudo.conceitos[ci] : null;

    if (!conceitoTxt) {
      ui.error("Conceito inválido para aprofundar.");
      return;
    }

    // ✅ Cache
    const key = this._aprofundarKey(sid, ci);
    const cache = this._getAprofCache();
    if (cache?.[key]) {
      this._toggleAprofSlot(sid, ci);
      return;
    }

    // 🔒 GATE (Aprofundar): explica e pergunta antes de abrir login/plans
    try {
      await this._ensureGatesUX().catch(() => null);

      const g = window.lioraGates || this.ctx?.gates || null;
      const ux = this._gatesUX || window.gatesUX || null;

      const check =
        g?.canAprofundar
          ? g.canAprofundar(this.ctx?.store)
          : (g?.canUseAprofundar
              ? g.canUseAprofundar(this.ctx?.store)
              : (g?.canGeneratePlan
                  ? g.canGeneratePlan(this.ctx?.store, { source: "aprofundar" })
                  : { ok: true }));

      if (check && check.ok === false) {
        const blocked = await (ux?.explainAndRoute?.({
          ctx: this.ctx,
          check,
          source: "aprofundar",
          statusElId: "tema-status",
          mode: "ask",
          copy: {
            body:
              (check.reason || "").toLowerCase().includes("login")
                ? "Para usar o Aprofundar, você precisa entrar (é rapidinho)."
                : "Você já usou seu limite diário de Aprofundar no Free/visitante. Para continuar, entre ou desbloqueie o Premium."
          }
        }) ?? true);

        if (blocked) return;
      }
    } catch (e) {
      console.warn("⚠️ Gates falhou (Aprofundar/Tema):", e);
    }

    const slot = document.getElementById(`aprof-slot-${sid}-${ci}`);
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
      const data = this._parseJsonResponse(text, "resposta de aprofundar");

      if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      if (!data?.topico || !data?.explicacaoLonga) {
        throw new Error("Aprofundamento inválido (faltando campos).");
      }

      const nextCache = { ...(cache || {}) };
      nextCache[key] = data;
      store.set("planoTemaAprofCache", nextCache);

      slot.innerHTML = this._renderAprof(data);

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
    const slot = document.getElementById(`aprof-slot-${sid}-${ci}`);
    if (!slot) return;

    const isHidden = slot.style.display === "none" || slot.style.display === "";
    slot.style.display = isHidden ? "block" : "none";
  },

  _aprofundarKey(sessaoId, conceitoIndex) {
    return `${String(sessaoId)}::C${String(conceitoIndex)}`;
  },

  _getAprofCache() {
    return this.ctx?.store?.get("planoTemaAprofCache") || {};
  },

  // -----------------------------
  // 🔒 Free limit (3 por dia) - legado (mantido)
  // -----------------------------
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

  // -----------------------------
  // 🧠 Progresso no store
  // -----------------------------
  _getState() {
    return this.ctx?.store?.get("planoTemaState") || { currentId: null, doneIds: [] };
  },

  _saveState(patch) {
    const st = this._getState();
    const next = {
      currentId: patch?.currentId ?? st.currentId ?? null,
      doneIds: Array.isArray(patch?.doneIds) ? patch.doneIds : (st.doneIds || [])
    };
    this.ctx.store.set("planoTemaState", next);
  },

  _resetStateForNewPlan(data) {
    const firstId = data?.sessoes?.[0]?.id || null;
    this.ctx.store.set("planoTemaState", { currentId: firstId, doneIds: [] });
  },

  _isDone(id) {
    const st = this._getState();
    const done = Array.isArray(st.doneIds) ? st.doneIds : [];
    return !!id && done.includes(id);
  },

  // -----------------------------
  // Helpers
  // -----------------------------
  _parseJsonResponse(text, label = "resposta") {
    if (typeof text !== "string" || !text.trim()) {
      throw new Error(`Servidor retornou ${label} vazia.`);
    }

    let raw = text.trim();

    // remove cercas markdown do tipo ```json ... ```
    raw = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // tenta parse direto primeiro
    try {
      return JSON.parse(raw);
    } catch (_) {
      // segue para extração defensiva
    }

    // tenta extrair apenas o trecho entre o primeiro { e o último }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      console.error(`❌ ${label} sem objeto JSON detectável:`, raw);
      throw new Error(`Servidor retornou ${label} inválida.`);
    }

    const candidate = raw.slice(start, end + 1);

    try {
      return JSON.parse(candidate);
    } catch (err) {
      const posMatch = String(err?.message || "").match(/position (\d+)/i);
      const pos = posMatch ? Number(posMatch[1]) : -1;
      const around =
        pos >= 0
          ? candidate.slice(Math.max(0, pos - 250), pos + 250)
          : candidate.slice(0, 500);

      console.error(`❌ Falha ao interpretar JSON da ${label}:`, err);
      console.error("📍 Trecho próximo do erro:", around);
      console.error("🧾 Resposta bruta completa:", raw);

      throw new Error(`Servidor retornou ${label} inválida.`);
    }
  },

  _normalizePlano(data, fallback) {
    const meta = data?.meta || {};
    const tema = meta?.tema || fallback?.tema || "Tema";
    const nivel = meta?.nivel || fallback?.nivel || "iniciante";

    const sessoes = Array.isArray(data?.sessoes) ? data.sessoes : [];

    const sessoesNorm = sessoes
      .map((s, i) => {
        const conteudo = s?.conteudo || {};

        const checklist = Array.isArray(s?.checklist) ? s.checklist : [];
        const errosComuns = Array.isArray(s?.errosComuns) ? s.errosComuns : [];
        const flashcards = Array.isArray(s?.flashcards) ? s.flashcards : [];
        const checkpoint = Array.isArray(s?.checkpoint) ? s.checkpoint : [];

        return {
          id: s?.id || `S${i + 1}`,
          titulo: s?.titulo || `Sessão ${i + 1}`,
          objetivo: s?.objetivo || "",

          tempoEstimadoMin: Number.isFinite(s?.tempoEstimadoMin) ? s.tempoEstimadoMin : 20,
          checklist,
          errosComuns,

          flashcards: flashcards
            .map((fc) => ({
              frente: fc?.frente || "",
              verso: fc?.verso || ""
            }))
            .filter((fc) => fc.frente || fc.verso),

          checkpoint: checkpoint.map((q) => ({
            tipo: q?.tipo || "mcq",
            pergunta: q?.pergunta || "",
            opcoes: Array.isArray(q?.opcoes) ? q.opcoes : [],
            correta: Number.isFinite(q?.correta) ? q.correta : 0,
            explicacao: q?.explicacao || "",
            gabarito: q?.gabarito || ""
          })),

          conteudo: {
            introducao: conteudo?.introducao || "",
            conceitos: Array.isArray(conteudo?.conceitos) ? conteudo.conceitos : [],
            exemplos: Array.isArray(conteudo?.exemplos) ? conteudo.exemplos : [],
            aplicacoes: Array.isArray(conteudo?.aplicacoes) ? conteudo.aplicacoes : [],
            resumoRapido: Array.isArray(conteudo?.resumoRapido) ? conteudo.resumoRapido : []
          }
        };
      })
      .filter((s) => s.titulo);

    return {
      meta: { tema, nivel },
      sessoes: sessoesNorm
    };
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

  // -----------------------------
  // ⌨️ Atalhos de teclado
  // ← anterior | → próxima | C concluir
  // -----------------------------
  _bindKeyboard() {
    if (this._keyboardBound) return;
    this._keyboardBound = true;
    window.addEventListener("keydown", (ev) => this._onKeydown(ev));
  },

  _onKeydown(ev) {
    const tag = (ev.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    const screenTema = document.getElementById("screen-tema");
    const isTemaActive = !!screenTema?.classList.contains("active");
    if (!isTemaActive) return;

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
  },

  // =========================================================
  // ✅ PROGRESS UI (Tema) - barra com % + etapas
  // Requer no HTML:
  // #tema-progress, #tema-progress-fill, #tema-progress-pct
  // =========================================================
  _progressShow() {
    const wrap = document.getElementById("tema-progress");
    if (!wrap) return;

    wrap.classList.remove("hidden");
    this._progressSet(0, "Iniciando…");
  },

  _progressHide() {
    const wrap = document.getElementById("tema-progress");
    if (!wrap) return;

    wrap.classList.add("hidden");
    this._progressSet(0, "");
  },

  _progressSet(pct, text = "") {
    const fill = document.getElementById("tema-progress-fill");
    const pctEl = document.getElementById("tema-progress-pct");
    const status = document.getElementById("tema-status");

    const p = Math.max(0, Math.min(100, Number(pct || 0)));

    if (fill) fill.style.width = `${p}%`;
    if (pctEl) pctEl.textContent = `${p}%`;
    if (status && text) status.textContent = text;
  },

  _progressSimulateDuringAi(startPct = 18, endPct = 88) {
    let running = true;
    let current = startPct;

    const msgs = [
      "Gerando com IA…",
      "Organizando as sessões…",
      "Estruturando conteúdos…",
      "Preparando checklist e erros comuns…",
      "Criando flashcards…",
      "Montando checkpoint…",
      "Finalizando ajustes…"
    ];

    let msgIndex = 0;

    const tick = () => {
      if (!running) return;

      const remaining = Math.max(1, endPct - current);
      const stepBase = remaining > 20 ? 2.2 : remaining > 8 ? 1.4 : 0.7;
      const stepJitter = Math.random() * 0.9;
      const step = Math.max(0.35, stepBase * 0.55 + stepJitter);

      current = Math.min(endPct, current + step);

      if (Math.random() < 0.35) {
        msgIndex = (msgIndex + 1) % msgs.length;
      }

      this._progressSet(Math.round(current), msgs[msgIndex]);

      if (current < endPct) {
        setTimeout(tick, 420 + Math.random() * 260);
      }
    };

    setTimeout(tick, 250);

    return () => {
      running = false;
    };
  }
};
