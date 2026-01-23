// /api/gerarPlanoPdf.js
module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed", message: "Use POST" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { pages, nivel, nomeArquivo } = body || {};

    if (!Array.isArray(pages) || pages.length === 0) {
      return res.status(400).json({
        error: "bad_request",
        message: "pages é obrigatório (array com {page,text})."
      });
    }

    const joinedLen = pages.reduce((acc, p) => acc + String(p?.text || "").length, 0);
    if (joinedLen < 400) {
      return res.status(400).json({
        error: "bad_request",
        message: "Texto extraído insuficiente. Seu PDF pode ser escaneado (imagem)."
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "config_error",
        message: "OPENAI_API_KEY não configurada no servidor."
      });
    }

    // ✅ System ULTRA FIEL: sem inventar, com evidências
    const system = `
Você é a IA educacional da Liora, especializada em estudar APOSTILAS para concursos.

OBJETIVO:
Gerar um PLANO DE ESTUDO ULTRA FIEL ao conteúdo do PDF fornecido.
O PDF é a única fonte de verdade.

REGRA DE OURO (obrigatória):
- Não invente tópicos, definições, regras, exemplos ou conteúdo que não estejam presentes no texto do PDF.
- Quando não houver informação suficiente no texto, escreva "não consta no material fornecido" (sem inventar).

FORMATO (retorne APENAS JSON válido):
{
  "meta": {
    "tema": "string",
    "nivel": "iniciante|intermediario|avancado"
  },
  "sessoes": [
    {
      "id": "S1",
      "titulo": "string",
      "objetivo": "string",
      "tempoEstimadoMin": 10,

      "fontes": [
        { "page": 1, "trecho": "string" }
      ],

      "checklist": ["string"],
      "errosComuns": ["string"],

      "flashcards": [
        { "frente": "string", "verso": "string" }
      ],

      "checkpoint": [
        {
          "tipo": "mcq",
          "pergunta": "string",
          "opcoes": ["string", "string", "string", "string"],
          "correta": 0,
          "explicacao": "string"
        },
        {
          "tipo": "mcq",
          "pergunta": "string",
          "opcoes": ["string", "string", "string", "string"],
          "correta": 1,
          "explicacao": "string"
        },
        {
          "tipo": "curta",
          "pergunta": "string",
          "gabarito": "string"
        }
      ],

      "conteudo": {
        "introducao": "string",
        "conceitos": ["string"],
        "exemplos": ["string"],
        "aplicacoes": ["string"],
        "resumoRapido": ["string"]
      }
    }
  ]
}

REGRAS DE FIDELIDADE (muito importante):
- Cada sessão DEVE conter "fontes" com 2 a 4 itens.
- Cada item de "fontes" deve ter:
  - page: número real de página do PDF
  - trecho: um trecho curto COPIADO/derivado diretamente do texto (máx 220 caracteres).
- "conteudo" deve ser uma reorganização didática do que está no PDF:
  - introducao: 2 a 4 frases, fiel ao material
  - conceitos: 4 a 7 itens (só conceitos do texto)
  - exemplos: 2 a 5 itens (se o PDF não der exemplo, use "não consta no material fornecido")
  - aplicacoes: 2 a 5 itens (se não constar, use "não consta no material fornecido")
  - resumoRapido: 4 a 7 itens

CHECKPOINT ULTRA FIEL:
- As perguntas devem ser respondíveis pelo texto do PDF.
- Não faça perguntas de conhecimento externo.
- mcq:
  - exatamente 4 opções
  - correta: índice 0..3
  - correta deve variar (não pode ser sempre 0)
  - explicacao deve citar a ideia do PDF (sem inventar)
- curta:
  - gabarito deve estar no texto do PDF (ou dizer "não consta no material fornecido")

QUANTIDADE:
- Gere entre 6 e 10 sessões.
- tempoEstimadoMin: 10..35
- checklist: 3..6
- errosComuns: 3..5
- flashcards: 3..6
- checkpoint: EXATAMENTE 3 itens (2 mcq + 1 curta)
`;

    // ✅ O "user" manda páginas com texto (rastreável)
    const user = `
ARQUIVO: ${nomeArquivo || "PDF"}
NÍVEL: ${nivel || "iniciante"}

PÁGINAS EXTRAÍDAS (use APENAS isto como fonte):
${JSON.stringify(pages, null, 2)}

Gere o plano completo ULTRA FIEL.
`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.25
      }),
    });

    const rawText = await r.text();

    if (!rawText || !rawText.trim()) {
      return res.status(500).json({
        error: "openai_empty_response",
        message: "OpenAI retornou resposta vazia."
      });
    }

    if (!r.ok) {
      return res.status(500).json({
        error: "openai_error",
        message: "Falha no provedor de IA",
        status: r.status,
        raw: rawText.slice(0, 900)
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({
        error: "openai_parse_error",
        message: "Resposta da OpenAI não é JSON válido.",
        raw: rawText.slice(0, 900),
      });
    }

    const outputText =
      parsed?.output_text ||
      parsed?.output?.[0]?.content?.[0]?.text ||
      "";

    const data = safeJsonParse(outputText);

    if (!data?.sessoes || !Array.isArray(data.sessoes) || data.sessoes.length < 3) {
      return res.status(500).json({
        error: "invalid_ai_payload",
        message: "Resposta da IA inválida (sem sessões).",
        raw: outputText.slice(0, 900)
      });
    }

    // ✅ Normaliza + valida ULTRA FIEL (fontes obrigatórias)
    const normalized = normalizePlanoPdfUltraFiel(data, {
      temaFallback: `PDF: ${nomeArquivo || "Documento"}`,
      nivelFallback: nivel || "iniciante",
      maxTrecho: 220
    });

    // ✅ Se faltou fontes, rejeita (para forçar fidelidade real)
    const invalidSources = normalized.sessoes.some(s => !Array.isArray(s.fontes) || s.fontes.length === 0);
    if (invalidSources) {
      return res.status(500).json({
        error: "missing_sources",
        message: "Plano rejeitado: sessões sem fontes (página/trecho). Isso é obrigatório no modo ULTRA FIEL.",
      });
    }

    return res.status(200).json(normalized);

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "server_error",
      message: String(e?.message || e)
    });
  }
};


// -------------------------
// Helpers
// -------------------------
function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") throw new Error("JSON vazio");
  raw = raw.trim();

  raw = raw.replace(/^```json/i, "```");
  const block = raw.match(/```([\s\S]*?)```/i);
  if (block) raw = block[1].trim();

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) raw = raw.slice(first, last + 1);

  if (!raw || !raw.trim()) throw new Error("JSON vazio após recorte");
  return JSON.parse(raw);
}

function normalizePlanoPdfUltraFiel(data, opts) {
  const temaFallback = opts?.temaFallback || "PDF";
  const nivelFallback = opts?.nivelFallback || "iniciante";
  const maxTrecho = Number.isFinite(opts?.maxTrecho) ? opts.maxTrecho : 220;

  const meta = data?.meta || {};
  const tema = meta?.tema || temaFallback;
  const nivel = meta?.nivel || nivelFallback;

  const sessoes = Array.isArray(data?.sessoes) ? data.sessoes : [];

  const sessoesNorm = sessoes.map((s, i) => {
    const conteudo = s?.conteudo || {};

    // fontes obrigatórias
    const fontesRaw = Array.isArray(s?.fontes) ? s.fontes : [];
    const fontes = fontesRaw
      .map((f) => ({
        page: Number.isFinite(f?.page) ? f.page : null,
        trecho: String(f?.trecho || "").trim().slice(0, maxTrecho)
      }))
      .filter((f) => Number.isFinite(f.page) && f.trecho);

    // checkpoint
    const checkpointRaw = Array.isArray(s?.checkpoint) ? s.checkpoint : [];
    const checkpoint = checkpointRaw.map((q) => ({
      tipo: q?.tipo || "mcq",
      pergunta: String(q?.pergunta || ""),
      opcoes: Array.isArray(q?.opcoes) ? q.opcoes : [],
      correta: Number.isFinite(q?.correta) ? q.correta : 0,
      explicacao: String(q?.explicacao || ""),
      gabarito: String(q?.gabarito || "")
    }));

    // flashcards
    const flashRaw = Array.isArray(s?.flashcards) ? s.flashcards : [];
    const flashcards = flashRaw
      .map((fc) => ({
        frente: String(fc?.frente || ""),
        verso: String(fc?.verso || "")
      }))
      .filter((fc) => fc.frente || fc.verso);

    return {
      id: s?.id || `S${i + 1}`,
      titulo: s?.titulo || `Sessão ${i + 1}`,
      objetivo: s?.objetivo || "",
      tempoEstimadoMin: Number.isFinite(s?.tempoEstimadoMin) ? s.tempoEstimadoMin : 20,

      fontes,

      checklist: Array.isArray(s?.checklist) ? s.checklist : [],
      errosComuns: Array.isArray(s?.errosComuns) ? s.errosComuns : [],
      flashcards,
      checkpoint,

      conteudo: {
        introducao: conteudo?.introducao || "",
        conceitos: Array.isArray(conteudo?.conceitos) ? conteudo.conceitos : [],
        exemplos: Array.isArray(conteudo?.exemplos) ? conteudo.exemplos : [],
        aplicacoes: Array.isArray(conteudo?.aplicacoes) ? conteudo.aplicacoes : [],
        resumoRapido: Array.isArray(conteudo?.resumoRapido) ? conteudo.resumoRapido : []
      }
    };
  });

  return { meta: { tema, nivel }, sessoes: sessoesNorm };
}
