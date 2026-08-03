const BRAND = {
  orange: [196, 75, 4], ink: [31, 31, 31], muted: [102, 102, 102],
  soft: [247, 242, 238], line: [225, 218, 212]
};

const SITE_URL = "https://getliora.ia.br";

export async function exportStudyPlanPdf(plano, options = {}) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error("O gerador de PDF não foi carregado. Atualize a página e tente novamente.");

  const sessoes = Array.isArray(plano?.sessoes) ? plano.sessoes : [];
  if (!sessoes.length) throw new Error("Este plano ainda não possui sessões para exportar.");

  const tema = clean(plano?.meta?.tema || plano?.tema || "Plano de estudos");
  const nivel = levelLabel(plano?.meta?.nivel || "iniciante");
  const totalMin = sessoes.reduce(
    (sum, sessao) => sum + (Number.isFinite(sessao?.tempoEstimadoMin) ? sessao.tempoEstimadoMin : 0), 0
  );
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const writer = createWriter(doc);

  drawCover(doc, { tema, nivel, sessoes: sessoes.length, totalMin, origem: options.origem });
  doc.addPage();
  writer.reset();
  writer.heading("Como usar este plano", 20);
  writer.paragraph("Use as sessões na ordem sugerida. Ao concluir cada etapa, marque o checklist, tente explicar os conceitos com suas próprias palavras e reserve alguns minutos para revisar antes de avançar.");
  writer.callout("Este plano é seu: você pode salvar, imprimir, fazer anotações e adaptar o ritmo à sua rotina.");
  writer.heading("Visão geral", 16);
  writer.stat("Tema", tema);
  writer.stat("Nível", nivel);
  writer.stat("Estrutura", `${sessoes.length} sessões`);
  writer.stat("Tempo estimado", totalMin ? formatDuration(totalMin) : "Definido em cada sessão");
  writer.heading("Roteiro", 16);
  sessoes.forEach((sessao, index) => {
    const tempo = Number.isFinite(sessao?.tempoEstimadoMin) ? ` · ${sessao.tempoEstimadoMin} min` : "";
    writer.bullet(`${index + 1}. ${clean(sessao?.titulo || `Sessão ${index + 1}`)}${tempo}`);
  });

  sessoes.forEach((sessao, index) => {
    doc.addPage();
    writer.reset();
    writeSession(writer, sessao, index, sessoes.length);
  });

  doc.addPage();
  drawFinalPage(doc, writer, { tema });
  addPageFooters(doc);
  doc.setProperties({ title: `Plano de estudos — ${tema}`, subject: "Plano de estudos criado com a Liora", author: "Liora — Intellih Tecnologia", creator: "Liora" });
  doc.save(`liora-plano-${slugify(tema)}.pdf`);
}

function writeSession(writer, sessao, index, total) {
  const conteudo = sessao?.conteudo || {};
  const tempo = Number.isFinite(sessao?.tempoEstimadoMin) ? `${sessao.tempoEstimadoMin} minutos` : "Tempo livre";

  // Página 1: compreensão. Mantém os blocos relacionados juntos e evita
  // que revisão e exercícios comecem espremidos no fim da página.
  writer.kicker(`SESSAO ${index + 1} DE ${total} - ${tempo}`);
  writer.heading(clean(sessao?.titulo || `Sessão ${index + 1}`), 20);
  if (sessao?.objetivo) writer.callout(`Objetivo: ${clean(sessao.objetivo)}`);
  if (conteudo?.introducao) {
    writer.heading("Para começar", 14);
    writer.paragraph(clean(conteudo.introducao));
  }
  const fontes = Array.isArray(sessao?.fontes)
    ? sessao.fontes.map((fonte) => `Página ${fonte?.page || "-"}: ${clean(fonte?.trecho)}`)
    : [];
  writer.listSection("Referências no material", fontes, { maxItems: 3 });
  writer.listSection("O que estudar", conteudo?.conceitos, { maxItems: 5 });
  writer.listSection("Exemplos", conteudo?.exemplos, { maxItems: 3 });
  writer.listSection("Aplicações práticas", conteudo?.aplicacoes, { maxItems: 4 });

  // Página 2: revisão e prática. A quebra deliberada elimina páginas com
  // alternativas soltas e dá uma hierarquia previsível a todas as sessões.
  writer.newPage();
  writer.kicker(`SESSAO ${index + 1} - REVISAO E PRATICA`);
  writer.heading(clean(sessao?.titulo || `Sessão ${index + 1}`), 18);
  writer.checkSection("Checklist da sessão", sessao?.checklist, { maxItems: 4 });

  const flashcards = Array.isArray(sessao?.flashcards) ? sessao.flashcards : [];
  if (flashcards.length) {
    writer.heading("Flashcards para revisão", 14);
    flashcards.slice(0, 4).forEach((card, cardIndex) => {
      writer.flashcard(card, cardIndex);
    });
  }

  const checkpoint = Array.isArray(sessao?.checkpoint) ? sessao.checkpoint : [];
  if (checkpoint.length) {
    writer.heading("Verificação rápida", 14);
    checkpoint.slice(0, 3).forEach((questao, questionIndex) => writer.question(questao, questionIndex));
  }

}

function drawCover(doc, meta) {
  doc.setFillColor(...BRAND.ink); doc.rect(0, 0, 210, 297, "F");
  doc.setFillColor(...BRAND.orange); doc.rect(0, 0, 10, 297, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(29); doc.text("Liora", 24, 35);
  doc.setTextColor(225, 225, 225); doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text("ESTUDO GUIADO POR IA", 24, 44);
  doc.setTextColor(...BRAND.orange); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("PLANO ESSENCIAL DE ESTUDOS", 24, 82);
  doc.setTextColor(255, 255, 255); doc.setFontSize(25);
  const titleLines = doc.splitTextToSize(meta.tema, 160);
  doc.text(titleLines, 24, 98, { lineHeightFactor: 1.15 });
  const titleBottom = 98 + titleLines.length * 9;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(210, 210, 210);
  doc.text(`${meta.nivel} · ${meta.sessoes} sessões${meta.totalMin ? ` · ${formatDuration(meta.totalMin)}` : ""}`, 24, titleBottom + 12);
  doc.setDrawColor(...BRAND.orange); doc.setLineWidth(1.3); doc.line(24, 244, 82, 244);
  doc.setFontSize(10); doc.setTextColor(225, 225, 225);
  doc.text("Um caminho claro para começar, praticar e avançar.", 24, 254);
  doc.text("Criado com a Liora · Intellih Tecnologia", 24, 275);
}

function drawFinalPage(doc, writer, meta) {
  writer.reset(34); writer.kicker("SEU PRÓXIMO PASSO"); writer.heading("Este plano ajuda você a começar.", 23);
  writer.paragraph(`Você já tem um caminho para estudar ${meta.tema}. Quando quiser transformar esse roteiro em uma experiência guiada, a Liora ajuda a aprofundar cada etapa e manter a continuidade.`);
  writer.heading("Na Liora, você também pode", 15);
  ["aprofundar os conceitos de cada sessão;", "revisar com flashcards interativos;", "responder checkpoints e simulados;", "estudar a partir dos seus próprios PDFs;", "acompanhar sessões concluídas e sua evolução."].forEach((item) => writer.bullet(item));
  writer.callout("Seu ritmo. Seu objetivo. Um plano que cabe na sua vida.");
  const y = writer.getY() + 8;
  doc.setFillColor(...BRAND.orange); doc.roundedRect(22, y, 166, 17, 3, 3, "F");
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Conheça a Liora", 105, y + 7, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(SITE_URL, 105, y + 12, { align: "center" });
  doc.link(22, y, 166, 17, { url: SITE_URL });
  doc.setTextColor(...BRAND.muted); doc.setFontSize(8.5); doc.text("Liora é um produto da Intellih Tecnologia.", 22, 274);
}

function createWriter(doc) {
  const marginX = 22, maxWidth = 166, bottom = 275;
  let y = 22;
  const ensure = (height = 10) => { if (y + height > bottom) { doc.addPage(); y = 22; } };
  const text = (content, options = {}) => {
    const value = clean(content); if (!value) return;
    const size = options.size || 10, lineHeight = options.lineHeight || 1.35, width = options.width || maxWidth;
    const lines = doc.splitTextToSize(value, width);
    const height = lines.length * size * 0.3528 * lineHeight + (options.gap ?? 4);
    ensure(height); doc.setFont("helvetica", options.bold ? "bold" : "normal"); doc.setFontSize(size);
    doc.setTextColor(...(options.color || BRAND.ink));
    doc.text(lines, marginX + (options.indent || 0), y, { lineHeightFactor: lineHeight }); y += height;
  };
  return {
    reset(start = 22) { y = start; }, getY() { return y; },
    kicker(value) { ensure(10); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...BRAND.orange); doc.text(clean(value).toUpperCase(), marginX, y); y += 8; },
    heading(value, size = 16) { ensure(size * 0.8 + 8); if (y > 24) y += 2; text(value, { size, bold: true, lineHeight: 1.15, gap: 5 }); },
    paragraph(value, options = {}) { text(value, options); },
    bullet(value, options = {}) { const indent = options.indent || 0; ensure(7); doc.setFillColor(...BRAND.orange); doc.circle(marginX + indent + 1.2, y - 1.2, 0.8, "F"); text(value, { size: 9.5, indent: indent + 5, width: maxWidth - indent - 5, gap: 2.5 }); },
    checkbox(value) { ensure(7); doc.setDrawColor(...BRAND.muted); doc.rect(marginX, y - 4, 3.4, 3.4); text(value, { size: 9.5, indent: 6, width: maxWidth - 6, gap: 2.5 }); },
    callout(value) { const lines = doc.splitTextToSize(clean(value), maxWidth - 12); const height = Math.max(16, lines.length * 4.5 + 9); ensure(height + 5); doc.setFillColor(...BRAND.soft); doc.setDrawColor(...BRAND.line); doc.roundedRect(marginX, y - 5, maxWidth, height, 2, 2, "FD"); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...BRAND.ink); doc.text(lines, marginX + 6, y + 2, { lineHeightFactor: 1.3 }); y += height + 5; },
    stat(label, value) { ensure(8); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...BRAND.ink); doc.text(`${label}:`, marginX, y); doc.setFont("helvetica", "normal"); doc.text(clean(value), marginX + 37, y); y += 7; },
    listSection(title, items, options = {}) { const list = normalizeList(items).slice(0, options.maxItems || 99); if (!list.length) return; this.heading(title, 14); list.forEach((item) => this.bullet(item)); },
    checkSection(title, items, options = {}) { const list = normalizeList(items).slice(0, options.maxItems || 99); if (!list.length) return; this.heading(title, 14); list.forEach((item) => this.checkbox(item)); },
    flashcard(card, index) {
      const frente = clean(card?.frente);
      const verso = clean(card?.verso);
      const value = `${index + 1}. ${frente}\nResposta: ${verso}`;
      const lines = doc.splitTextToSize(value, maxWidth - 12);
      const height = Math.max(15, lines.length * 3.7 + 7);
      ensure(height + 3);
      doc.setFillColor(250, 248, 246);
      doc.setDrawColor(...BRAND.line);
      doc.roundedRect(marginX, y - 4, maxWidth, height, 2, 2, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.8);
      doc.setTextColor(...BRAND.ink);
      doc.text(lines, marginX + 6, y + 1, { lineHeightFactor: 1.25 });
      y += height + 3;
    },
    question(question, index) {
      const prompt = `${index + 1}. ${clean(question?.pergunta)}`;
      text(prompt, { size: 9.2, bold: true, lineHeight: 1.22, gap: 2 });
      const options = Array.isArray(question?.opcoes) ? question.opcoes.slice(0, 4) : [];
      if (options.length) {
        options.forEach((option, optionIndex) => {
          text(`${String.fromCharCode(65 + optionIndex)}) ${clean(option)}`, {
            size: 8.6,
            indent: 5,
            width: maxWidth - 5,
            lineHeight: 1.18,
            gap: 1
          });
        });
        y += 2;
      } else {
        this.answerLines(2);
      }
    },
    newPage() { doc.addPage(); y = 22; },
    answerLines(count = 2) { ensure(count * 8); doc.setDrawColor(...BRAND.line); for (let i = 0; i < count; i += 1) doc.line(marginX, y + i * 7, marginX + maxWidth, y + i * 7); y += count * 7 + 2; }
  };
}

function addPageFooters(doc) {
  const pages = doc.getNumberOfPages();
  for (let page = 2; page <= pages; page += 1) {
    doc.setPage(page); doc.setDrawColor(...BRAND.line); doc.line(22, 283, 188, 283);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...BRAND.muted);
    doc.text("Liora · Estudo guiado por IA", 22, 289); doc.text(`${page - 1}`, 188, 289, { align: "right" });
  }
}

function normalizeList(value) { return Array.isArray(value) ? value.map(clean).filter(Boolean) : []; }
function clean(value) { return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim(); }
function levelLabel(value) { return ({ iniciante: "Iniciante", intermediario: "Intermediário", avancado: "Avançado" })[String(value || "").toLowerCase()] || "Iniciante"; }
function formatDuration(minutes) { const hours = Math.floor(minutes / 60), rest = minutes % 60; if (!hours) return `${minutes} min`; return rest ? `${hours}h ${rest}min` : `${hours}h`; }
function slugify(value) { return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "estudos"; }
