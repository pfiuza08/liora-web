// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO (sem SDK)
// - Mistura MCQ + C/E e (opcional) Discursivas
// - Retorna SEMPRE JSON
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

// Perfil de estilo por banca (heurística prática)
function bancaProfile(bancaRaw) {
  const b = String(bancaRaw || "").toUpperCase();

  if (b.includes("CEBRASPE") || b.includes("CESPE")) {
    return {
      id: "CEBRASPE",
      nome: "CESPE/CEBRASPE",
      estilo:
        "Estilo C/E com assertivas. Linguagem técnica, precisão conceitual, exceções e termos condicionais. Evite floreio. Para MCQ, alternativas muito plausíveis e próximas."
    };
  }
  if (b.includes("FCC")) {
    return {
      id: "FCC",
      nome: "FCC",
      estilo:
        "Enunciado descritivo moderado, cobra definição + aplicação. Distratores com termos parecidos. Linguagem formal."
    };
  }
  if (b.includes("VUNESP")) {
    return {
      id: "VUNESP",
      nome: "VUNESP",
      estilo:
        "Objetiva e escolar, comandos claros. Alternativas bem separadas. Contexto prático quando útil."
    };
  }
  if (b.includes("IBFC")) {
    return {
      id: "IBFC",
      nome: "IBFC",
      estilo:
        "Direta, foco no essencial. Cobrança literal de conceitos e procedimentos. Alternativas curtas."
    };
  }
  if (b.includes("AOCP")) {
    return {
      id: "AOCP",
      nome: "AOCP",
      estilo:
        "Intermediária: enunciado claro, cobra aplicação. Alternativas plausíveis. Evite textos longos."
    };
  }

  return {
    id: "FGV",
    nome: "FGV",
    estilo:
      "Alternativas muito plausíveis e próximas. Cobra interpretação e aplicação. Pegadinhas sutis (absolutos, exceções, nuances)."
  };
}

function safeStr(x) {
  return String(x ?? "").trim();
}

function normalizeAlts(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map((a) => safeStr(a))
    .filter(Boolean);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Use POST" });
    }

    const {
      banca,
      qtd,
      dificuldade,
      tema,
      qtdCE,
      qtdDiscursivas
    } = req.body || {};

    const QTD_TOTAL = clamp(qtd ?? 5, 3, 30);

    // CE e Disc vêm do front (agora sim)
    const QTD_CE_RAW = clamp(qtdCE ?? 0, 0, 20);
    const QTD_DISC_RAW = clamp(qtdDiscursivas ?? 0, 0, 10);

    // ✅ fecha a conta: MCQ = total - CE - Disc (com clamp)
    const QTD_CE = clamp(QTD_CE_RAW, 0, Math.max(0, QTD_TOTAL - 1));
    const QTD_DISC = clamp(QTD_DISC_RAW, 0, Math.max(0, QTD_TOTAL - QTD_CE));

    const QTD_MCQ = Math.max(0, QTD_TOTAL - QTD_CE - QTD_DISC);

    const BANCA = safeStr(banca || "FGV");
    const DIFICULDADE = safeStr(dificuldade || "misturado");
    const TEMA = safeStr(tema || "");

    const profile = bancaProfile(BANCA);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY ausente no ambiente"
      });
    }

    const prompt = `
Você é um gerador de questões de simulado com estilo de banca.

BANCA: ${profile.nome}
PERFIL DA BANCA (aplique rigorosamente):
${profile.estilo}

DIFICULDADE: ${DIFICULDADE}
TEMA: ${TEMA ? `"${TEMA}"` : "Livre (tema geral da área)"}

OBJETIVO:
- Gere exatamente ${QTD_MCQ} questões MCQ (4 alternativas).
- Gere exatamente ${QTD_CE} questões de CERTO/ERRADO (2 alternativas: "Certo" e "Errado").
- Gere exatamente ${QTD_DISC} questões DISCURSIVAS.

REGRAS IMPORTANTES:
- NÃO use markdown.
- NÃO use emojis.
- Linguagem compatível com a banca.
- Para MCQ:
  - tipo: "mcq"
  - enunciado: string
  - alternativas: 4 strings (SEM A/B/C/D)
  - corretaIndex: 0..3
  - explicacao: 1 a 2 frases
- Para C/E:
  - tipo: "ce"
  - enunciado: string (assertiva típica de prova)
  - alternativas: ["Certo", "Errado"] (exatamente assim)
  - corretaIndex: 0 ou 1
  - explicacao: 1 a 2 frases
- Para Discursiva:
  - enunciado: string (pergunta)
  - respostaModelo: 4 a 8 linhas no máximo
  - criterios: 3 a 6 itens

FORMATO: responda SOMENTE JSON válido, exatamente assim:

{
  "questoes": [
    {
      "tipo": "mcq",
      "enunciado": "...",
      "alternativas": ["...", "...", "...", "..."],
      "corretaIndex": 0,
      "explicacao": "..."
    },
    {
      "tipo": "ce",
      "enunciado": "...",
      "alternativas": ["Certo", "Errado"],
      "corretaIndex": 0,
      "explicacao": "..."
    }
  ],
  "discursivas": [
    {
      "enunciado": "...",
      "respostaModelo": "...",
      "criterios": ["...", "...", "..."]
    }
  ]
}

DICA DE QUALIDADE:
- Distratores plausíveis e coerentes.
- Use termos típicos da banca (ex.: "assinale", "é correto afirmar", "considere", etc.).
`.trim();

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.35,
        max_tokens: 2200,
        messages: [
          {
            role: "system",
            content:
              "Você gera simulado em JSON rigoroso. Responda apenas JSON válido conforme o schema pedido."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const rawText = await resp.text();

    if (!resp.ok) {
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

    const data = JSON.parse(rawText);
    const content = data?.choices?.[0]?.message?.content || "";

    let parsed = null;
    try {
      if (safeStr(content).startsWith("{")) parsed = JSON.parse(safeStr(content));
    } catch {}

    if (!parsed) parsed = extractJsonObject(content);

    if (!parsed || !Array.isArray(parsed.questoes)) {
      return res.status(200).json({
        ok: false,
        error: "Modelo não retornou JSON no formato esperado",
        rawPreview: safeStr(content).slice(0, 300)
      });
    }

    // --- saneamento: mistura MCQ + CE em "questoes"
    const saneAll = parsed.questoes
      .filter((q) => q && typeof q.enunciado === "string" && Array.isArray(q.alternativas))
      .map((q) => {
        const tipo = safeStr(q.tipo || "");
        const enunciado = safeStr(q.enunciado);
        const alts = normalizeAlts(q.alternativas);

        const isCE = tipo === "ce" || alts.length === 2;
        const normTipo = isCE ? "ce" : "mcq";

        const alternativas = isCE
          ? ["Certo", "Errado"]
          : alts.slice(0, 4);

        const maxIdx = isCE ? 1 : 3;
        const corretaIndex = Number.isInteger(q.corretaIndex)
          ? clamp(q.corretaIndex, 0, maxIdx)
          : 0;

        return {
          tipo: normTipo,
          enunciado,
          alternativas,
          corretaIndex,
          explicacao: safeStr(q.explicacao || "")
        };
      });

    const saneMCQ = saneAll.filter((q) => q.tipo === "mcq").slice(0, QTD_MCQ);
    const saneCE = saneAll.filter((q) => q.tipo === "ce").slice(0, QTD_CE);

    // Se o modelo veio com menos do que precisa, completa com mock CE/MCQ localmente (mínimo robusto)
    const needMCQ = Math.max(0, QTD_MCQ - saneMCQ.length);
    const needCE = Math.max(0, QTD_CE - saneCE.length);

    const filler = buildFallbackMix({
      banca: profile.nome,
      tema: TEMA || "Geral",
      dificuldade: DIFICULDADE,
      needMCQ,
      needCE
    });

    const finalMCQ = saneMCQ.concat(filler.mcq).slice(0, QTD_MCQ);
    const finalCE = saneCE.concat(filler.ce).slice(0, QTD_CE);

    // mistura para parecer prova (intercala de forma simples)
    const questoes = interleave(finalMCQ, finalCE).slice(0, QTD_MCQ + QTD_CE);

    // --- discursivas
    const parsedDisc = Array.isArray(parsed.discursivas) ? parsed.discursivas : [];
    const saneDisc = parsedDisc
      .filter(
        (d) =>
          d &&
          typeof d.enunciado === "string" &&
          typeof d.respostaModelo === "string" &&
          Array.isArray(d.criterios) &&
          d.criterios.length >= 2
      )
      .slice(0, QTD_DISC)
      .map((d) => ({
        enunciado: safeStr(d.enunciado),
        respostaModelo: safeStr(d.respostaModelo),
        criterios: (d.criterios || []).slice(0, 8).map((c) => safeStr(c)).filter(Boolean)
      }));

    return res.status(200).json({
      ok: true,
      questoes,         // ✅ MCQ + CE (misturado) para o front
      discursivas: saneDisc, // ✅ fica pronto para UI futura
      meta: {
        banca: BANCA,
        perfilBanca: profile.id,
        dificuldade: DIFICULDADE,
        tema: TEMA,
        qtdTotal: QTD_TOTAL,
        qtdMCQ: QTD_MCQ,
        qtdCE: QTD_CE,
        qtdDiscursivas: QTD_DISC
      }
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

// ----- helpers locais do backend -----
function interleave(a, b) {
  const out = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

function buildFallbackMix({ banca, tema, needMCQ, needCE }) {
  const mcq = [];
  const ce = [];

  for (let i = 0; i < needMCQ; i++) {
    mcq.push({
      tipo: "mcq",
      enunciado: `(${banca}) Em ${tema}, assinale a alternativa correta.`,
      alternativas: [
        "Afirmação correta (modelo)",
        "Distrator plausível 1",
        "Distrator plausível 2",
        "Distrator plausível 3"
      ],
      corretaIndex: 0,
      explicacao: "A alternativa 1 é a correta por aderir ao conceito central cobrado."
    });
  }

  for (let i = 0; i < needCE; i++) {
    ce.push({
      tipo: "ce",
      enunciado: `(${banca}) ${tema}: A assertiva apresentada está correta sob a regra geral aplicável ao tema.`,
      alternativas: ["Certo", "Errado"],
      corretaIndex: 1,
      explicacao: "A assertiva é incorreta por contrariar um requisito/condição essencial do tema."
    });
  }

  return { mcq, ce };
}
