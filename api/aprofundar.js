module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed", message: "Use POST" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { tema, nivel, sessaoId, sessaoTitulo, conceito } = body || {};

    if (!tema || !conceito) {
      return res.status(400).json({
        error: "bad_request",
        message: "tema e conceito são obrigatórios"
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "config_error",
        message: "OPENAI_API_KEY não configurada no servidor."
      });
    }

    const system = `
Você é a IA educacional da Liora.
Sua tarefa é aprofundar UM conceito específico de uma sessão.

Regras obrigatórias:
- Retorne APENAS JSON válido (sem markdown, sem texto extra).
- Não inclua crases, blocos de código ou comentários.
- Mantenha didático, direto e com densidade (nada raso).

Formato EXATO:

{
  "topico": "string",
  "explicacaoLonga": "string",
  "exemploResolvido": ["string", "string", "string"],
  "pegadinha": "string",
  "miniCheck": ["string", "string"]
}

Qualidade obrigatória:
- explicacaoLonga: 6 a 10 linhas, objetiva, com o "como reconhecer" na prática
- exemploResolvido: 3 a 6 passos, passo a passo (não genérico)
- pegadinha: 1 erro comum + como evitar
- miniCheck: 2 perguntas rápidas em texto (estilo auto-teste)
`;

    const user = `
TEMA: ${tema}
NÍVEL: ${nivel || "iniciante"}
SESSÃO: ${sessaoId || ""} — ${sessaoTitulo || ""}
CONCEITO PARA APROFUNDAR: ${conceito}

Gere o aprofundamento seguindo o formato.
`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user }
        ],
        temperature: 0.35
      })
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
        raw: rawText.slice(0, 900)
      });
    }

    const outputText =
      parsed?.output_text ||
      parsed?.output?.[0]?.content?.[0]?.text ||
      "";

    const data = safeJsonParse(outputText);

    if (!data?.topico || !data?.explicacaoLonga) {
      return res.status(500).json({
        error: "invalid_ai_payload",
        message: "Aprofundamento inválido (faltando campos).",
        raw: outputText.slice(0, 900)
      });
    }

    // normaliza
    const out = {
      topico: String(data.topico || "Aprofundamento"),
      explicacaoLonga: String(data.explicacaoLonga || ""),
      exemploResolvido: Array.isArray(data.exemploResolvido) ? data.exemploResolvido : [],
      pegadinha: String(data.pegadinha || ""),
      miniCheck: Array.isArray(data.miniCheck) ? data.miniCheck : []
    };

    return res.status(200).json(out);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
};

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
