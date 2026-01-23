module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed", message: "Use POST" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { tema, nivel } = body;

    if (!tema) {
      return res.status(400).json({ error: "bad_request", message: "tema é obrigatório" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "config_error", message: "OPENAI_API_KEY não configurada no servidor." });
    }

    const system = `
Você é a IA educacional da Liora.
Gere um plano de estudos por TEMA, retornando SESSÕES completas.
Retorne APENAS JSON válido, sem markdown e sem texto extra.
Formato obrigatório:
{
  "meta": { "tema": "string", "nivel": "iniciante|intermediario|avancado" },
  "sessoes": [
    {
      "id": "S1",
      "titulo": "string",
      "objetivo": "string",
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
- 6 a 10 sessões
- cada lista: 3 a 6 itens
`.trim();

    const user = `TEMA: ${tema}\nNÍVEL: ${nivel || "iniciante"}\nGere o plano completo e sessões completas.`;

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
        temperature: 0.4,
      }),
    });

    const rawText = await r.text();

    // ✅ Se OpenAI não respondeu nada, a gente já explica
    if (!rawText || !rawText.trim()) {
      return res.status(500).json({
        error: "openai_empty_response",
        message: "OpenAI retornou resposta vazia (corpo vazio).",
        status: r.status,
      });
    }

    // ✅ Se status não OK, devolve preview
    if (!r.ok) {
      return res.status(500).json({
        error: "openai_error",
        message: "Falha no provedor de IA",
        status: r.status,
        raw: rawText.slice(0, 900),
      });
    }

    // ✅ Parse seguro do JSON da OpenAI
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({
        error: "openai_parse_error",
        message: "Não consegui interpretar a resposta da OpenAI (não é JSON).",
        raw: rawText.slice(0, 900),
      });
    }

    // ✅ Extrai texto gerado
    const outputText =
      parsed?.output_text ||
      parsed?.output?.[0]?.content?.[0]?.text ||
      "";

    if (!outputText || !outputText.trim()) {
      return res.status(500).json({
        error: "openai_no_output_text",
        message: "OpenAI respondeu, mas sem output_text.",
        debug: {
          keys: Object.keys(parsed || {}),
          output0: parsed?.output?.[0] || null,
        },
      });
    }

    // ✅ Parse do JSON gerado pela IA (com recorte)
    const data = safeJsonParse(outputText);

    if (!data?.sessoes || !Array.isArray(data.sessoes) || data.sessoes.length < 3) {
      return res.status(500).json({
        error: "invalid_ai_payload",
        message: "Resposta da IA inválida (sem sessões).",
        raw: outputText.slice(0, 900),
      });
    }

    // Normaliza IDs
    data.sessoes = data.sessoes.map((s, i) => ({
      id: s?.id || `S${i + 1}`,
      titulo: s?.titulo || `Sessão ${i + 1}`,
      objetivo: s?.objetivo || "",
      conteudo: {
        introducao: s?.conteudo?.introducao || "",
        conceitos: Array.isArray(s?.conteudo?.conceitos) ? s.conteudo.conceitos : [],
        exemplos: Array.isArray(s?.conteudo?.exemplos) ? s.conteudo.exemplos : [],
        aplicacoes: Array.isArray(s?.conteudo?.aplicacoes) ? s.conteudo.aplicacoes : [],
        resumoRapido: Array.isArray(s?.conteudo?.resumoRapido) ? s.conteudo.resumoRapido : [],
      },
    }));

    data.meta = data.meta || { tema, nivel };
    data.meta.tema = data.meta.tema || tema;
    data.meta.nivel = data.meta.nivel || nivel;

    return res.status(200).json(data);

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "server_error",
      message: String(e?.message || e),
    });
  }
};

// -------------------------
// Helpers
// -------------------------
function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") throw new Error("JSON vazio");

  raw = raw.trim();

  // remove cercas se a IA vacilar
  raw = raw.replace(/^```json/i, "```");
  const block = raw.match(/```([\s\S]*?)```/i);
  if (block) raw = block[1].trim();

  // recorta de { até o último }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) raw = raw.slice(first, last + 1);

  // ✅ Aqui era onde explodia com string vazia
  if (!raw || !raw.trim()) throw new Error("JSON vazio após recorte");

  return JSON.parse(raw);
}
