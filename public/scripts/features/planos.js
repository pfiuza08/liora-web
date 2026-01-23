export const planos = {
  ctx: null,

  // estado runtime
  _plano: null,
  _idxAtual: 0,
  _sessoes: [],

  init(ctx) {
    this.ctx = ctx;

    const btn = document.getElementById("btn-gerar-tema");
    const limpar = document.getElementById("btn-limpar-plano");

    btn?.addEventListener("click", () => this.gerarTema());
    limpar?.addEventListener("click", () => this.limparPlano());

    // se existir plano salvo, renderiza
    const saved = this.ctx.store.get("planoTema");
    if (saved?.sessoes?.length) {
      this.render(saved);
    }

    this._bindKeyboard();
    console.log("planos.js iniciado");
  },

  // -----------------------------
  // 🔥 Geração por Tema (robusta)
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

    try {
      ui.loading(true, "Gerando plano e sessões…");
      if (status) status.textContent = "Chamando IA…";

      const res = await fetch("/api/gerarPlano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema, nivel })
      });

      const text = await res.text();
      let data = null;

      try {
        data = JSON.parse(text);
      } catch (err) {
        console.error("Resposta não-JSON:", text);
        throw new Error("Servidor retornou resposta inválida (não JSON).");
      }

      if (!res.ok) {
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      }

      if (!data?.sessoes?.length) {
        throw new Error("Resposta inválida: sem sessões.");
      }

      // normalização leve (garante estrutura)
      data = this._normalizePlano(data, { tema, nivel });

      store.set("planoTema", data);

      // reset de progresso quando gera plano novo
      this._resetStateForNewPlan(data);

      this.render(data);

      if (status) status.textContent = "Plano gerado!";
    } catch (e) {
      console.error(e);
      this.ctx.ui.error(e?.message || "Falha ao gerar plano por tema.");
      if (status) status.textContent = "";
    } finally {
      this.ctx.ui.loading(false);
    }
  },

  limparPlano() {
    const { store } = this.ctx;
    store.remove("planoTema");
    store.remove("planoTemaState");

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

    if (done.has(sessao.id)) done.delete(sessao.id);
    else done.add(sessao.id);

    this._saveState({ doneIds: Array.from(done), currentId: sessao.id });

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
      ? `<div class="box">
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

                 // ✅ curta (com campo de resposta)
                 return `
                   <div class="cq" data-cq="${qi}">
                     <div class="cq-q"><span class="cq-tag">Curta</span> ${pergunta}</div>

                     <textarea class="cq-input" id="cq-in-${qi}" placeholder="Escreva sua resposta aqui…"></textarea>

                     <div class="cq-row">
                       <button type="button" class="cq-check" data-check="${qi}">Comparar com gabarito</button>

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

      ${checklistHtml}
      ${errosHtml}
      ${flashcardsHtml}
      ${checkpointHtml}

      <div class="box">
        <b>Introdução</b>
        <p>${this._escapeHtml(introducao)}</p>
      </div>

      <div class="box">
        <b>Conceitos</b>
        ${listOrDash(conceitos)}
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
    `;

    // toolbar
    document.getElementById("btn-prev-sessao")?.addEventListener("click", () => this._goPrev());
    document.getElementById("btn-next-sessao")?.addEventListener("click", () => this._goNext());
    document.getElementById("btn-done-sessao")?.addEventListener("click", () => this._toggleDoneCurrent());

    // flashcards: flip
    view.querySelectorAll("[data-flashcard]").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.classList.toggle("flipped");
      });
    });

    // checkpoint: show/hide explicação/gabarito (texto correto)
    view.querySelectorAll("[data-show]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qi = btn.getAttribute("data-show");
        const label = btn.getAttribute("data-show-label") || "conteúdo";
        const el = document.getElementById(`cq-exp-${qi}`);
        if (!el) return;

        const open = el.style.display !== "none";
        el.style.display = open ? "none" : "block";

        if (open) btn.textContent = `Mostrar ${label}`;
        else btn.textContent = `Ocultar ${label}`;
      });
    });

    // checkpoint: answer selection feedback (MCQ)
    view.querySelectorAll(".cq-opt").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qi = Number(btn.getAttribute("data-q"));
        const oi = Number(btn.getAttribute("data-oi"));

        const q = checkpoint[qi];
        const correta = Number.isFinite(q?.correta) ? q.correta : -1;

        // visual: desmarca outras
        view.querySelectorAll(`.cq-opt[data-q="${qi}"]`).forEach((b) => b.classList.remove("selected", "right", "wrong"));
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

    // curta: comparar com gabarito (feedback humano)
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

        // mostra gabarito
        exp.style.display = "block";

        // feedback simples e útil
        fb.textContent =
          "✅ Ótimo. Compare sua resposta com o gabarito e ajuste 1 ponto se necessário.";
      });
    });
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
  }
};
