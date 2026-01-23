export const planos = {
  ctx: null,

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

    console.log("planos.js iniciado");
  },

  // -----------------------------
  // 🔥 Geração por Tema (robusta)
  // - nunca quebra com "Unexpected token A"
  // - lê como TEXTO e faz parse controlado
  // - mostra erro amigável se backend enviar html/texto
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

      // ✅ lê como texto (evita crash quando vem erro não-JSON)
      const text = await res.text();
      let data = null;

      try {
        data = JSON.parse(text);
      } catch (err) {
      console.error("Resposta não-JSON:", text);
    
      const preview = text.slice(0, 120).replace(/\s+/g, " ");
      throw new Error(`Servidor retornou resposta inválida (não JSON). Prévia: ${preview}`);
      }

      if (!res.ok) {
        throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      }

      if (!data?.sessoes?.length) {
        throw new Error("Resposta inválida: sem sessões.");
      }

      // normalização leve (garante estrutura)
      data = this._normalizePlano(data, { tema, nivel });

      store.set("planoTema", data);
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

    result.classList.remove("hidden");
    lista.innerHTML = "";

    const sessoes = Array.isArray(data?.sessoes) ? data.sessoes : [];

    sessoes.forEach((s, i) => {
      const btn = document.createElement("button");
      btn.className = "session-item";
      btn.type = "button";
      btn.textContent = s.titulo || `Sessão ${i + 1}`;

      btn.addEventListener("click", () => {
        lista
          .querySelectorAll(".session-item")
          .forEach((x) => x.classList.remove("active"));

        btn.classList.add("active");
        this.renderSessao(s);
      });

      lista.appendChild(btn);

      // auto abre primeira
      if (i === 0) {
        btn.classList.add("active");
        this.renderSessao(s);
      }
    });

    console.log("Plano renderizado:", sessoes.length, "sessões");
  },

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

    view.innerHTML = `
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
  }
};
