module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ✅ Em alguns ambientes o req.body vem como string
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { tema, nivel } = body;

    if (!tema) return res.status(400).json({ error: "tema é obrigatório" });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY não configurada no servidor." });
    }

    // ✅ Melhor usar instructions + input (oficial da Responses API)
    const instructions = `
Você é a IA educacional da Liora.
Gere um plano de estudos por TEMA, retornando SESSÕES completas.
Retorne APENAS JSON válido, sem markdown e sem texto extra.
`.trim();

    const input = `
TEMA: ${tema}
NÍVEL: ${nivel || "iniciante"}

Gere entre 6 e 10 sessões.
Cada sessão deve ter:
- id: S1, S2...
- titulo
- objetivo
- conteudo: introducao, conceitos[], exemplos[], aplicacoes[], resumoRapido[]
`.trim();

    // ✅ JSON Schema (garante que vem no formato certo)
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        meta: {
          type: "object",
          additionalProperties: false,
          properties: {
            tema: { type: "string" },
            nivel: { type: "string", enum: ["iniciante", "intermediario", "avancado"] }
          },
          required: ["tema", "nivel"]
        },
        sessoes: {
          type: "array",
          minItems: 6,
          maxItems: 10,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              titulo: { type: "string" },
              objetivo: { type: "string" },
              conteudo: {
                type: "object",
                additionalProperties: false,
                properties: {
                  introducao: { type: "string" },
                  conceitos: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
                  exemplos: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
                  aplicacoes: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } },
                  resumoRapido: { type: "array", minItems: 3, maxItems: 6, items: { type: "string" } }
                },
                required: ["introducao", "conceitos", "exemplos", "aplicacoes", "resumoRapido"]
              }
            },
            required: ["id", "titulo", "objetivo", "conteudo"]
          }
        }
      },
      required: ["meta", "sessoes"]
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions,
        input,
        temperature: 0.4,
        text: {
          format: {
            type: "json_schema",
            name: "liora_plano_tema",
            schema,
            strict: true
          }
        }
      }),
    });

    const raw = await r.text();

    if (!r.ok) {
      return res.status(500).json({
        error: "Falha no provedor de IA",
        status: r.status,
        raw: raw.slice(0, 800),
      });
    }

    const parsed = JSON.parse(raw);
    const outputText = parsed?.output_text || "";
    const data = JSON.parse(outputText);

    return res.status(200).json(data);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
};
