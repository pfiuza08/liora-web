module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed", message: "Use POST" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { textoBase, nivel, nomeArquivo } = body || {};

    if (!textoBase) {
      return res.status(400).json({ error: "bad_request", message: "textoBase é obrigatório" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "config_error", message: "OPENAI_API_KEY não configurada no servidor." });
    }

    const system = `
Você é a IA educacional da Liora.

Tarefa:
Gerar um PLANO DE ESTUDOS a partir de um TEXTO extraído de um PDF.
Retorne SESSÕES completas, com blocos de estudo ativo premium.

Regras obrigatórias:
- Retorne APENAS JSON válido (sem markdown, sem texto extra).
- Não inclua crases, blocos de código ou comentários.
- O JSON deve seguir EXATAMENTE este formato:

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
          "correta": 0,
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

Restrições:
- Gere entre 6 e 10 sessões.
- tempoEstimadoMin: 10..35 (inteiro)
- checklist: 3..6 itens
- errosComuns: 3..5 itens
- flashcards: 3..6 cards
- checkpoint: EXATAMENTE 3 itens (2 mcq + 1 curta)
- mcq correta varia (não pode ser sempre 0)
- Conteúdo em português, direto, com densidade (não raso).
- Use os tópicos do texto como base (não inventar assuntos fora do documento).
`;

    const user = `
ARQUIVO: ${nomeArquivo || "PDF"}
NÍVEL: ${nivel || "iniciante"}

TEXTO (recorte):
${textoBase}

Gere o plano completo seguindo o formato.
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
        temperature: 0.35,
      }),
    });

    const rawText = await r.text();

    if (!rawText || !rawText.trim()) {
      return res.status(500).json({
        error: "openai_empty_response",
        message: "OpenAI retornou resposta vazia.",
      });
    }

    if (!r.ok) {
      return res.status(500).json({
        error: "openai_error",
        message: "Falha no provedor de IA",
        status: r.status,
        raw: rawText.slice(0, 900),
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
        raw: outputText.slice(0, 900),
      });
    }

    // meta default
    data.meta = data.meta || {};
    data.meta.tema = data.meta.tema || `PDF: ${nomeArquivo || "Documento"}`;
    data.meta.nivel = data.meta.nivel || (nivel || "iniciante");

    return res.status(200).json(data);

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "server_error",
      message: String(e?.message || e),
    });
  }
};

// Helpers
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
