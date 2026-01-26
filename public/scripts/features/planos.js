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
  // ✅ Progress bar helpers (Tema)
  // Requer no HTML:
  // #tema-progress, #tema-progress-fill, #tema-progress-pct
  // -----------------------------
  _setProgress(kind, pct) {
    const wrap = document.getElementById(`${kind}-progress`);
    const fill = document.getElementById(`${kind}-progress-fill`);
    const label = document.getElementById(`${kind}-progress-pct`);
    if (!wrap || !fill || !label) return;

    const v = Math.max(0, Math.min(100, Number(pct || 0)));
    wrap.classList.remove("hidden");
    fill.style.width = `${v}%`;
    label.textContent = `${v}%`;
  },

  _hideProgress(kind) {
    const wrap = document.getElementById(`${kind}-progress`);
    if (wrap) wrap.classList.add("hidden");
  },

  // -----------------------------
  // 🔥 Geração por Tema (robusta)
  // ✅ com barra de progresso
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

      this._setProgress("tema", 10);

      const res = await fetch("/api/gerarPlano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema, nivel })
      });

      this._setProgress("tema", 35);

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

      this._setProgress("tema", 60);

      data = this._normalizePlano(data, { tema, nivel });
      store.set("planoTema", data);

      // reset de progresso quando gera plano novo
      this._resetStateForNewPlan(data);

      // limpa cache/uso de aprofundar do plano (não apaga contagem diária)
      this.ctx.store.set("planoTemaAprofCache", {});

      this._setProgress("tema", 85);

      this.render(data);

      if (status) status.textContent = "Plano gerado!";
      this._setProgress("tema", 100);
    } catch (e) {
      console.error(e);
      this.ctx.ui.error(e?.message || "Falha ao gerar plano por tema.");
      if (status) status.textContent = "";
    } finally {
      this.ctx.ui.loading(false);
      setTimeout(() => this._hideProgress("tema"), 650);
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

    this._hideProgress("tema");

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

                 // ✅ curta (com campo + gabarito)
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

    // ✅ Conceitos com botão Aprofundar (inline)
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

      <!-- ✅ CONTEÚDO PRIMEIRO -->
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

      <!-- ✅ SUPORTE -->
      ${checklistHtml}
      ${errosHtml}
      ${flashcardsHtml}

      <!-- ✅ AVALIAÇÃO POR ÚLTIMO -->
      ${checkpointHtml}
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

    // ✅ show/hide explicação/gabarito
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

    // MCQ: feedback
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

    // Curta: comparar com gabarito
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

    // ✅ Aprofundar: bind nos botões
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
  // 🔎 Aprofundar (Premium + limite Free)
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

    // ✅ Limite Free
    const user = store.get("user") || null;
    const isPremium = !!user?.premium;

    if (!isPremium) {
      const can = this._canUseAprofFree();
      if (!can.ok) {
        ui.error(
          `Você já usou seus ${can.limit}/dia de Aprofundar no plano Free. Desbloqueie ilimitado no Premium.`
        );
        return;
      }
    }

    const slot = document.getElementById(`aprof-slot-${sid}-${ci}`);
    if (!slot) return;

    try {
      slot.style.display = "block";
      slot.innerHTML = `<div class="muted small">Gerando aprofundamento…</div>`;

      // infos do plano atual
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
        console.error("Aprofundar não-JSON:", text);
        throw new Error("Resposta inválida do servidor (não JSON).");
      }

      if (!res.ok) {
        throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
      }

      // validação mínima
      if (!data?.topico || !data?.explicacaoLonga) {
        throw new Error("Aprofundamento inválido (faltando campos).");
      }

      // salva no cache
      const nextCache = { ...(cache || {}) };
      nextCache[key] = data;
      store.set("planoTemaAprofCache", nextCache);

      // conta uso no Free
      const userNow = store.get("user") || null;
      if (!userNow?.premium) this._incAprofFreeUse();

      // renderiza
      slot.innerHTML = this._renderAprof(data);

      // atualiza label do botão
      const selector = `.btn-aprofundar[data-aprof-sid="${this._escapeAttr(sid)}"][data-aprof-ci="${ci}"]`;
      const btn = document.querySelector(selector);
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
  // 🔒 Free limit (3 por dia)
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

    // reset diário
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

  // para montar seletor sem quebrar por aspas
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
  }
};
