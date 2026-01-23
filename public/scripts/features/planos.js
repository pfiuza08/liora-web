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

      // ✅ endpoint correto (sem .js)
      const res = await fetch("/api/gerarPlano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema, nivel })
      });

      // ✅ lê como texto (evita crash quando vem erro não-JSON)
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

      // ✅ reset de progresso quando gera plano novo
      this._resetStateForNewPlan(data);

      this.render(data);

      if (status) status.textContent = "Plano gerado!";
    } catch (e) {
      console.error(e);
      ui.error(e?.message || "Falha ao gerar plano por tema.");
      if (status) status.textContent = "";
    } finally {
      ui.loading(false);
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

    // guarda estado runtime
    this._plano = data;
    this._sessoes = Array.isArray(data?.sessoes) ? data.sessoes : [];

    result.classList.remove("hidden");
    lista.innerHTML = "";

    // ✅ pega progresso salvo (continuar de onde parou)
    const st = this._getState();
    const lastId = st?.currentId || null;
    const idxLast = lastId ? this._sessoes.findIndex((s) => s?.id === lastId) : -1;

    // se não achar, abre a primeira
    this._idxAtual = idxLast >= 0 ? idxLast : 0;

    // render da lista
    this._sessoes.forEach((s, i) => {
      const btn = document.createElement("button");
      btn.className = "session-item";
      btn.type = "button";
      btn.dataset.index = String(i);

      const done = this._isDone(s?.id);
      const prefix = done ? "✅ " : "";
      btn.textContent = prefix + (s.titulo || `Sessão ${i + 1}`);

      btn.addEventListener("click", () => {
        this._setCurrentIndex(i);
      });

      lista.appendChild(btn);
    });

    // abre a sessão correta
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

    // clamp
    const idx = Math.max(0, Math.min(n - 1, Number(i || 0)));
    this._idxAtual = idx;

    // ativa botão na lista
    lista?.querySelectorAll(".session-item").forEach((x) => x.classList.remove("active"));

    const btn = lista?.querySelector(`.session-item[data-index="${idx}"]`);
    btn?.classList.add("active");

    // render sessão
    const sessao = this._sessoes[idx];
    this.renderSessao(sessao);

    // salva progresso atual
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

    // re-render lista (para atualizar ✅)
    this._refreshListChecks();

    // re-render sessão (para atualizar botão)
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
  // 🧱 Render Sessão (com toolbar)
  // -----------------------------
  renderSessao(s) {
    const view = document.getElementById("sessao-view");
    if (!view) return;

    const titulo = s?.titulo || "Sessão";
    const objetivo = s?.objetivo || "-";

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

    view.innerHTML = `
      <div class="sessao-toolbar">
        <div class="sessao-progress">
          Sessão <b>${pos}</b> / ${n}
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

    // bind toolbar buttons
    const bPrev = document.getElementById("btn-prev-sessao");
    const bNext = document.getElementById("btn-next-sessao");
    const bDone = document.getElementById("btn-done-sessao");

    bPrev?.addEventListener("click", () => this._goPrev());
    bNext?.addEventListener("click", () => this._goNext());
    bDone?.addEventListener("click", () => this._toggleDoneCurrent());
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

        return {
          id: s?.id || `S${i + 1}`,
          titulo: s?.titulo || `Sessão ${i + 1}`,
          objetivo: s?.objetivo || "",
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
  // ⌨️ Atalhos de teclado (A+)
  // ← anterior | → próxima | C concluir
  // -----------------------------
  _bindKeyboard() {
    if (this._keyboardBound) return;
    this._keyboardBound = true;

    window.addEventListener("keydown", (ev) => this._onKeydown(ev));
  },

  _onKeydown(ev) {
    // não atrapalha digitação em inputs/selects/textareas
    const tag = (ev.target?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    // só funciona quando estiver na tela de "Tema"
    const screenTema = document.getElementById("screen-tema");
    const isTemaActive = !!screenTema?.classList.contains("active");
    if (!isTemaActive) return;

    // precisa ter sessões carregadas
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
