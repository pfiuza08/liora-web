// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO
// - Gera N questões com alternativas + corretaIndex
// - Retorna JSON pronto pro simulados.js
// ==========================================================

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.max(min, Math.min(max, x));
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

    const prompt = `
Você é um gerador de questões de simulado.
Gere exatamente ${QTD} questões estilo banca ${BANCA}.
Dificuldade: ${DIFICULDADE}.
Tema: ${TEMA ? `"${TEMA}"` : "Livre (tema geral da área de estudos)"}

Regras:
- Cada questão deve ter:
  - enunciado (texto curto e claro)
  - alternativas: array com 4 opções (A-D)
  - corretaIndex: número inteiro 0..3
  - explicacao: 1 a 2 frases explicando por que a alternativa correta é a certa
- Não use markdown.
- Não numere as alternativas com letras; eu já coloco isso no front.
- Evite pegadinhas injustas: seja estilo prova, mas didático.
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: "Você gera questões de múltipla escolha em JSON rigoroso." },
        { role: "user", content: prompt }
      ]
    });

    const raw = completion?.choices?.[0]?.message?.content || "";

    // Tenta parsear JSON (o modelo pode vir com lixo antes/depois)
    const jsonText = raw.trim().startsWith("{")
      ? raw.trim()
      : raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);

    const parsed = JSON.parse(jsonText);

    const questoes = Array.isArray(parsed?.questoes) ? parsed.questoes : [];

    // saneamento simples
    const sane = questoes
      .filter(q => q?.enunciado && Array.isArray(q?.alternativas) && q.alternativas.length === 4)
      .map(q => ({
        enunciado: String(q.enunciado).trim(),
        alternativas: q.alternativas.map(a => String(a).trim()),
        corretaIndex: clamp(q.corretaIndex ?? 0, 0, 3),
        explicacao: String(q.explicacao || "").trim()
      }));

    return res.status(200).json({
      ok: true,
      questoes: sane,
      meta: { banca: BANCA, dificuldade: DIFICULDADE, tema: TEMA, qtd: QTD }
    });
  } catch (err) {
    console.error("❌ gerarSimulado error:", err);
    return res.status(500).json({
      ok: false,
      error: "Falha ao gerar simulado",
      detail: String(err?.message || err)
    });
  }
}
