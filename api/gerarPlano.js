export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { tema, nivel } = req.body || {};
    if (!tema) return res.status(400).json({ error: "tema é obrigatório" });

    // ✅ Prompt fechado (Plano + Sessões)
    const system = `
Você é a IA educacional da Liora.

Tarefa:
Gerar um plano de estudos por TEMA, retornando SESSÕES completas.

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
- Gere entre 6 e 10 sessões (depende do tema e do nível).
- Cada lista deve ter 3 a 6 itens.
- Conteúdo em português, didático, direto.
`;

    const user = `
TEMA: ${tema}
NÍVEL: ${nivel}

Gere o plano completo e sessões completas.
`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OPENAI_API_KEY não configurada no servidor." });
    }

    // ✅ Chamada OpenAI (Responses API)
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
        temperature: 0.4
      }),
    });

    const rawText = await r.text();

    // Se falhar, devolve erro com corpo para debug
    if (!r.ok) {
      return res.status(500).json({
        error: "Falha no provedor de IA",
        status: r.status,
        raw: rawText.slice(0, 500)
      });
    }

    // Extrai texto gerado
    let outputText = "";
    try {
      const parsed = JSON.parse(rawText);
      outputText =
        parsed?.output?.[0]?.content?.[0]?.text ||
        parsed?.output_text ||
        "";
    } catch (e) {
      return res.status(500).json({
        error: "Falha ao interpretar resposta do provedor",
        raw: rawText.slice(0, 500)
      });
    }

    // ✅ Parse seguro do JSON gerado
    const data = safeJsonParse(outputText);

    // Validação mínima
    if (!data?.sessoes || !Array.isArray(data.sessoes) || data.sessoes.length < 3) {
      return res.status(500).json({
        error: "Resposta da IA inválida (sem sessões)",
        raw: outputText.slice(0, 500)
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
        resumoRapido: Array.isArray(s?.conteudo?.resumoRapido) ? s.conteudo.resumoRapido : []
      }
    }));

    // garante meta
    data.meta = data.meta || { tema, nivel };
    data.meta.tema = data.meta.tema || tema;
    data.meta.nivel = data.meta.nivel || nivel;

    return res.status(200).json(data);

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error", message: String(e?.message || e) });
  }
}

// -------------------------
// Helpers
// -------------------------
function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") throw new Error("JSON vazio");

  // remove cercas se a IA vacilar
  raw = raw.trim();
  raw = raw.replace(/^```json/i, "```");
  const block = raw.match(/```([\s\S]*?)```/i);
  if (block) raw = block[1].trim();

  // recorta de { até o último }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) raw = raw.slice(first, last + 1);

  return JSON.parse(raw);
}
