// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO (SEM SDK openai)
// - Chama OpenAI via fetch direto
// - Retorna SEMPRE JSON
// - Questões: enunciado + alternativas + corretaIndex + explicacao
// ==========================================================

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.max(min, Math.min(max, x));
}

// Extrai JSON mesmo que venha com texto extra
function extractJsonObject(text) {
  if (!text) return null;

  const s = String(text);
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = s.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Use POST" });
    }

    const { banca, qtd, dificuldade, tema } = req.body || {};

    const QTD = clamp(qtd ?? 5, 3, 30);
    const BANCA = String(banca || "FGV");
    const DIFICULDADE = String(dificuldade || "misturado");
    const TEMA = String(tema || "").trim();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY ausente no ambiente"
      });
    }

    const prompt = `
Você é um gerador de questões de simulado.
Gere exatamente ${QTD} questões estilo banca ${BANCA}.
Dificuldade: ${DIFICULDADE}.
Tema: ${TEMA ? `"${TEMA}"` : "Livre (tema geral da área)"}

Regras:
- Cada questão deve ter:
  - enunciado (curto e claro)
  - alternativas: array com 4 opções (A-D)
  - corretaIndex: inteiro 0..3
  - explicacao: 1 a 2 frases explicando a correta
- Não use markdown.
- Não numere alternativas com letras; o front faz isso.
- Responda SOMENTE em JSON válido no formato:

{
  "questoes": [
    {
      "enunciado": "...",
      "alternativas": ["...", "...", "...", "..."],
      "corretaIndex": 0,
      "explicacao": "..."
    }
  ]
}
`.trim();

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          { role: "system", content: "Você gera questões de múltipla escolha em JSON rigoroso." },
          { role: "user", content: prompt }
        ]
      })
    });

    const rawText = await resp.text();

    if (!resp.ok) {
      // aqui a OpenAI pode devolver JSON de erro, ou texto
      let errJson = null;
      try {
        errJson = JSON.parse(rawText);
      } catch {}

      return res.status(500).json({
        ok: false,
        error: "OpenAI retornou erro",
        status: resp.status,
        detail: errJson?.error?.message || rawText.slice(0, 300)
      });
    }

    // A resposta da OpenAI é JSON
    const data = JSON.parse(rawText);
    const content = data?.choices?.[0]?.message?.content || "";

    // parse do JSON das questões
    let parsed = null;
    try {
      if (String(content).trim().startsWith("{")) {
        parsed = JSON.parse(String(content).trim());
      }
    } catch {}

    if (!parsed) parsed = extractJsonObject(content);

    if (!parsed || !Array.isArray(parsed.questoes)) {
      return res.status(200).json({
        ok: false,
        error: "Modelo não retornou JSON no formato esperado",
        rawPreview: String(content).slice(0, 300)
      });
    }

    const sane = parsed.questoes
      .filter(
        (q) =>
          q &&
          typeof q.enunciado === "string" &&
          Array.isArray(q.alternativas) &&
          q.alternativas.length >= 4
      )
      .slice(0, QTD)
      .map((q) => ({
        enunciado: String(q.enunciado).trim(),
        alternativas: q.alternativas.slice(0, 4).map((a) => String(a).trim()),
        corretaIndex: clamp(q.corretaIndex ?? 0, 0, 3),
        explicacao: String(q.explicacao || "").trim()
      }));

    if (!sane.length) {
      return res.status(200).json({
        ok: false,
        error: "Questões inválidas após validação",
        rawPreview: String(content).slice(0, 300)
      });
    }

    return res.status(200).json({
      ok: true,
      questoes: sane,
      meta: { banca: BANCA, dificuldade: DIFICULDADE, tema: TEMA, qtd: QTD }
    });
  } catch (err) {
    console.error("❌ gerarSimulado error:", err);
    return res.status(500).json({
      ok: false,
      error: "Falha interna ao gerar simulado",
      detail: String(err?.message || err)
    });
  }
}
