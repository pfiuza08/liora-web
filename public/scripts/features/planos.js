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

    console.log("📚 planos.js iniciado");
  },

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

      const res = await fetch("/api/gerarPlano.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tema, nivel })
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      if (!data?.sessoes?.length) {
        throw new Error("Resposta inválida: sem sessões.");
      }

      store.set("planoTema", data);
      this.render(data);

      if (status) status.textContent = "✅ Plano gerado!";
    } catch (e) {
      console.error(e);
      ui.error(e?.message || "Falha ao gerar plano por tema.");
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

    console.log("🧹 Plano removido");
  },

  render(data) {
    const result = document.getElementById("tema-result");
    const lista = document.getElementById("lista-sessoes");
    const view = document.getElementById("sessao-view");

    if (!result || !lista || !view) return;

    result.classList.remove("hidden");
    lista.innerHTML = "";

    const sessoes = data.sessoes || [];
    sessoes.forEach((s, i) => {
      const btn = document.createElement("button");
      btn.className = "session-item";
      btn.type = "button";
      btn.textContent = s.titulo || `Sessão ${i + 1}`;

      btn.addEventListener("click", () => {
        lista.querySelectorAll(".session-item").forEach(x => x.classList.remove("active"));
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

    console.log("✅ Plano renderizado:", sessoes.length, "sessões");
  },

  renderSessao(s) {
    const view = document.getElementById("sessao-view");
    if (!view) return;

    const c = s.conteudo || {};
    const conceitos = Array.isArray(c.conceitos) ? c.conceitos : [];
    const exemplos = Array.isArray(c.exemplos) ? c.exemplos : [];
    const aplicacoes = Array.isArray(c.aplicacoes) ? c.aplicacoes : [];
    const resumo = Array.isArray(c.resumoRapido) ? c.resumoRapido : [];

    view.innerHTML = `
      <h4>${s.titulo || "Sessão"}</h4>
      <p class="muted"><b>Objetivo:</b> ${s.objetivo || "-"}</p>

      <div class="box">
        <b>Introdução</b>
        <p>${c.introducao || "—"}</p>
      </div>

      <div class="box">
        <b>Conceitos</b>
        ${conceitos.length ? `<ul>${conceitos.map(x => `<li>${x}</li>`).join("")}</ul>` : "<p class='muted'>—</p>"}
      </div>

      <div class="box">
        <b>Exemplos</b>
        ${exemplos.length ? `<ul>${exemplos.map(x => `<li>${x}</li>`).join("")}</ul>` : "<p class='muted'>—</p>"}
      </div>

      <div class="box">
        <b>Aplicações</b>
        ${aplicacoes.length ? `<ul>${aplicacoes.map(x => `<li>${x}</li>`).join("")}</ul>` : "<p class='muted'>—</p>"}
      </div>

      <div class="box">
        <b>Resumo rápido</b>
        ${resumo.length ? `<ul>${resumo.map(x => `<li>${x}</li>`).join("")}</ul>` : "<p class='muted'>—</p>"}
      </div>
    `;
  }
};
