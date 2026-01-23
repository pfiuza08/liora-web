// scripts/features/pdf.js
export const pdf = {
  ctx: null,

  _plano: null,
  _sessoes: [],
  _idxAtual: 0,

  async init(ctx) {
    this.ctx = ctx;

    const btn = document.getElementById("btn-gerar-pdf");
    const limpar = document.getElementById("btn-limpar-pdf");

    btn?.addEventListener("click", () => this.gerarPorPdf());
    limpar?.addEventListener("click", () => this.limparPlano());

    // restore
    const saved = this.ctx.store.get("planoPdf");
    if (saved?.sessoes?.length) this.render(saved);

    console.log("pdf.js iniciado");
  },

  async gerarPorPdf() {
    const { store, ui } = this.ctx;

    const inp = document.getElementById("inp-pdf");
    const nivel = document.getElementById("sel-nivel-pdf")?.value || "iniciante";
    const status = document.getElementById("pdf-status");

    const file = inp?.files?.[0] || null;
    if (!file) {
      ui.error("Selecione um PDF primeiro.");
      return;
    }

    try {
      ui.loading(true, "Lendo PDF e gerando plano…");
      if (status) status.textContent = "Extraindo texto do PDF…";

      const texto = await this._extractPdfText(file);

      if (!texto || texto.length < 200) {
        throw new Error("Não consegui extrair texto suficiente do PDF.");
      }

      if (status) status.textContent = "Chamando IA…";

      const res = await fetch("/api/gerarPlanoPdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nivel,
          nomeArquivo: file.name,
          textoBase: texto.slice(0, 22000) // limite seguro
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

      data = this._normalizePlano(data, {
        tema: `PDF: ${file.name}`,
        nivel
      });

      store.set("planoPdf", data);
      store.set("planoPdfState", { currentId: data?.sessoes?.[0]?.id || null, doneIds: [] });
      store.set("planoPdfAprofCache", {});

      this.render(data);

      if (status) status.textContent = "Plano gerado!";
    } catch (e) {
      console.error(e);
      ui.error(e?.message || "Falha ao gerar plano por PDF.");
      if (status) status.textContent = "";
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
    this.renderSessao(sessao);

    if (!opts.silentSave) this._saveState({ currentId: sessao?.id });
  },

  renderSessao(s) {
    const view = document.getElementById("pdf-sessao-view");
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

    const n = this._sessoes.length;
    const pos = this._idxAtual + 1;
    const tempoChip = tempo ? `<span class="chip">⏱ ${tempo} min</span>` : "";

    const listOrDash = (arr) =>
      arr.length
        ? `<ul>${arr.map((x) => `<li>${this._escapeHtml(x)}</li>`).join("")}</ul>`
        : `<p class="muted">—</p>`;

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

    const checkpointHtml = checkpoint.length
      ? `<div class="box">
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
        <div class="sessao-progress">Sessão <b>${pos}</b> / ${n} ${tempoChip}</div>
      </div>

      <h4>${this._escapeHtml(titulo)}</h4>
      <p class="muted"><b>Objetivo:</b> ${this._escapeHtml(objetivo)}</p>

      <div class="box"><b>Introdução</b><p>${this._escapeHtml(introducao)}</p></div>
      <div class="box"><b>Conceitos</b>${listOrDash(conceitos)}</div>
      <div class="box"><b>Exemplos</b>${listOrDash(exemplos)}</div>
      <div class="box"><b>Aplicações</b>${listOrDash(aplicacoes)}</div>
      <div class="box"><b>Resumo rápido</b>${listOrDash(resumo)}</div>

      ${checklistHtml}
      ${errosHtml}
      ${flashcardsHtml}
      ${checkpointHtml}
    `;

    // flashcards
    view.querySelectorAll("[data-flashcard]").forEach((btn) => {
      btn.addEventListener("click", () => btn.classList.toggle("flipped"));
    });

    // show/hide exp
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

        view.querySelectorAll(`.cq-opt[data-q="${qi}"]`).forEach((b) => b.classList.remove("selected", "right", "wrong"));
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
  },

  // -----------------------------
  // PDF.js extraction (CDN)
  // -----------------------------
  async _extractPdfText(file) {
    const buf = await file.arrayBuffer();

    // PDF.js via CDN (ESM)
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.mjs";

    const loadingTask = pdfjs.getDocument({ data: buf });
    const pdf = await loadingTask.promise;

    const maxPages = Math.min(pdf.numPages, 12); // bom p/ custo + qualidade
    let fullText = "";

    for (let p = 1; p <= maxPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const strings = content.items.map((it) => it.str);
      fullText += strings.join(" ") + "\n";
      if (fullText.length > 26000) break;
    }

    return fullText.trim();
  },

  // state
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
  }
};
