// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO (SEM SDK openai)
// - OpenAI via fetch direto
// - Retorna SEMPRE JSON (com questoes e discursivas, mesmo que vazios)
// - MCQ: tipo="mcq" | alternativas(4) | corretaIndex 0..3 | explicacao
// - CE : tipo="ce"  | alternativas(2) | corretaIndex 0..1 | explicacao
// - DISC: tipo="disc" | sem alternativas | respostaModelo | criterios[]
//
// ✅ NOVO (contrato):
// - payload aceita mode: "obj" (default) | "disc"
// - mode="obj" -> retorna questoes (mcq/ce) e discursivas: []
// - mode="disc" -> retorna questoes: [] e discursivas (disc)
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
        "Enunciados com assertivas e foco em precisão conceitual. Pegadinhas semânticas e exceções. Linguagem técnica e direta. Distratores plausíveis e muito próximos."
    };
  }
  if (b.includes("FCC")) {
    return {
      id: "FCC",
      nome: "FCC",
      estilo:
        "Enunciado mais descritivo, cobra definição + aplicação. Distratores com termos parecidos. Linguagem formal."
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

// mistura MCQ e CE alternando para dar sensação de prova
function interleave(mcq, ce) {
  const out = [];
  let i = 0, j = 0;
  while (i < mcq.length || j < ce.length) {
    if (i < mcq.length) out.push(mcq[i++]);
    if (j < ce.length) out.push(ce[j++]);
  }
  return out;
}

export default async function handler(req, res) {
  // ✅ contrato estável: sempre devolve esses campos
  const empty = (status = 200, extra = {}) =>
    res.status(status).json({
      ok: false,
      questoes: [],
      discursivas: [],
      meta: {},
      ...extra
    });

  try {
    if (req.method !== "POST") {
      return empty(405, { error: "Use POST" });
    }

    const {
      banca,
      qtd,
      dificuldade,
      tema,
      qtdCE,
      qtdDiscursivas,
      mode
    } = req.body || {};

    const BANCA = String(banca || "FGV");
    const DIFICULDADE = String(dificuldade || "misturado");
    const TEMA = String(tema || "").trim();

    const profile = bancaProfile(BANCA);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return empty(500, { error: "OPENAI_API_KEY ausente no ambiente" });
    }

    const MODE = String(mode || "obj").toLowerCase() === "disc" ? "disc" : "obj";

    // --------------------------------------------
    // MODO DISC: gera SOMENTE discursivas
    // --------------------------------------------
    if (MODE === "disc") {
      // regra: se qtdDiscursivas não vier, usa qtd como fallback
      const QTD_DISC = clamp(qtdDiscursivas ?? qtd ?? 5, 1, 30);

      const promptDISC = `
Você é um gerador de questões de simulado com estilo de banca.

BANCA: ${profile.nome}
PERFIL DA BANCA (aplique rigorosamente):
${profile.estilo}

DIFICULDADE: ${DIFICULDADE}
TEMA: ${TEMA ? `"${TEMA}"` : "Livre (tema geral da área)"}

SAÍDA:
- Gere exatamente ${QTD_DISC} questões DISCURSIVAS.

REGRAS IMPORTANTES:
- NÃO use markdown.
- NÃO inclua emojis.
- Responda SOMENTE JSON válido.

SCHEMA EXATO:
{
  "disc": [
    {
      "tipo": "disc",
      "enunciado": "...",
      "respostaModelo": "...",
      "criterios": ["...", "...", "..."]
    }
  ]
}

DICAS DE QUALIDADE (sensação de banca real):
- Comando claro (explique, discorra, analise, diferencie, justifique).
- Resposta modelo com estrutura (2 a 8 linhas), objetiva e técnica.
- Critérios avaliativos objetivos (3 a 6 itens).
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
            { role: "user", content: promptDISC }
          ]
        })
      });

      const rawText = await resp.text();

      if (!resp.ok) {
        let errJson = null;
        try { errJson = JSON.parse(rawText); } catch {}
        return empty(500, {
          error: "OpenAI retornou erro",
          status: resp.status,
          detail: errJson?.error?.message || rawText.slice(0, 300)
        });
      }

      const data = JSON.parse(rawText);
      const content = data?.choices?.[0]?.message?.content || "";

      let parsed = null;
      try {
        if (String(content).trim().startsWith("{")) {
          parsed = JSON.parse(String(content).trim());
        }
      } catch {}
      if (!parsed) parsed = extractJsonObject(content);

      if (!parsed) {
        return empty(200, {
          error: "Modelo não retornou JSON válido (DISC)",
          rawPreview: String(content).slice(0, 300)
        });
      }

      const arrDISC = Array.isArray(parsed.disc) ? parsed.disc : [];

      const saneDISC = arrDISC
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
          tipo: "disc",
          enunciado: String(d.enunciado).trim(),
          respostaModelo: String(d.respostaModelo).trim(),
          criterios: d.criterios.slice(0, 8).map((c) => String(c).trim())
        }));

      // se veio vazio, devolve ok=false mas mantendo contrato
      if (!saneDISC.length) {
        return empty(200, {
          error: "DISC insuficientes após validação",
          rawPreview: String(content).slice(0, 300)
        });
      }

      return res.status(200).json({
        ok: true,
        questoes: [],
        discursivas: saneDISC,
        meta: {
          mode: "disc",
          banca: BANCA,
          perfilBanca: profile.id,
          dificuldade: DIFICULDADE,
          tema: TEMA,
          qtdDiscursivas: saneDISC.length
        }
      });
    }

    // --------------------------------------------
    // MODO OBJ: gera SOMENTE objetivas (MCQ + CE)
    // --------------------------------------------
    const QTD_TOTAL = clamp(qtd ?? 5, 3, 30);

    // regra: preserve pelo menos 3 MCQ
    const CE_RAW = clamp(qtdCE ?? 0, 0, 30);
    const QTD_CE = Math.min(CE_RAW, Math.max(0, QTD_TOTAL - 3));
    const QTD_MCQ = Math.max(3, QTD_TOTAL - QTD_CE);

    const promptOBJ = `
Você é um gerador de questões de simulado com estilo de banca.

BANCA: ${profile.nome}
PERFIL DA BANCA (aplique rigorosamente):
${profile.estilo}

DIFICULDADE: ${DIFICULDADE}
TEMA: ${TEMA ? `"${TEMA}"` : "Livre (tema geral da área)"}

SAÍDA:
- Gere exatamente ${QTD_MCQ} questões MCQ (4 alternativas).
- Gere exatamente ${QTD_CE} questões de CERTO/ERRADO (2 alternativas: Certo/Errado).

REGRAS IMPORTANTES:
- NÃO use markdown.
- NÃO inclua emojis.
- Para MCQ: NÃO inclua letras A/B/C/D nas alternativas.
- Para CE: alternativas devem ser exatamente ["Certo","Errado"].
- Responda SOMENTE JSON válido.

SCHEMA EXATO:
{
  "mcq": [
    {
      "tipo": "mcq",
      "enunciado": "...",
      "alternativas": ["...", "...", "...", "..."],
      "corretaIndex": 0,
      "explicacao": "..."
    }
  ],
  "ce": [
    {
      "tipo": "ce",
      "enunciado": "...",
      "alternativas": ["Certo","Errado"],
      "corretaIndex": 0,
      "explicacao": "..."
    }
  ]
}

DICAS DE QUALIDADE (sensação de banca real):
- Distratores plausíveis, errados por 1 detalhe.
- Varie comandos (assinale, considere, é correto afirmar, etc).
- Para C/E, use assertivas com nuance (não óbvias).
- Explicação: 1–2 frases, objetiva, sem floreio.
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
        max_tokens: 2400,
        messages: [
          {
            role: "system",
            content:
              "Você gera simulado em JSON rigoroso. Responda apenas JSON válido conforme o schema pedido."
          },
          { role: "user", content: promptOBJ }
        ]
      })
    });

    const rawText = await resp.text();

    if (!resp.ok) {
      let errJson = null;
      try { errJson = JSON.parse(rawText); } catch {}
      return empty(500, {
        error: "OpenAI retornou erro",
        status: resp.status,
        detail: errJson?.error?.message || rawText.slice(0, 300)
      });
    }

    const data = JSON.parse(rawText);
    const content = data?.choices?.[0]?.message?.content || "";

    let parsed = null;
    try {
      if (String(content).trim().startsWith("{")) {
        parsed = JSON.parse(String(content).trim());
      }
    } catch {}
    if (!parsed) parsed = extractJsonObject(content);

    if (!parsed) {
      return empty(200, {
        error: "Modelo não retornou JSON válido (OBJ)",
        rawPreview: String(content).slice(0, 300)
      });
    }

    const arrMCQ = Array.isArray(parsed.mcq) ? parsed.mcq : [];
    const arrCE = Array.isArray(parsed.ce) ? parsed.ce : [];

    const saneMCQ = arrMCQ
      .filter(
        (q) =>
          q &&
          typeof q.enunciado === "string" &&
          Array.isArray(q.alternativas) &&
          q.alternativas.length >= 4
      )
      .slice(0, QTD_MCQ)
      .map((q) => ({
        tipo: "mcq",
        enunciado: String(q.enunciado).trim(),
        alternativas: q.alternativas.slice(0, 4).map((a) => String(a).trim()),
        corretaIndex: clamp(q.corretaIndex ?? 0, 0, 3),
        explicacao: String(q.explicacao || "").trim()
      }));

    const saneCE = arrCE
      .filter(
        (q) =>
          q &&
          typeof q.enunciado === "string" &&
          Array.isArray(q.alternativas) &&
          q.alternativas.length >= 2
      )
      .slice(0, QTD_CE)
      .map((q) => ({
        tipo: "ce",
        enunciado: String(q.enunciado).trim(),
        alternativas: ["Certo", "Errado"],
        corretaIndex: clamp(q.corretaIndex ?? 0, 0, 1),
        explicacao: String(q.explicacao || "").trim()
      }));

    // garante mínimo de MCQ (segurança)
    if (saneMCQ.length < 3) {
      return empty(200, {
        error: "MCQ insuficientes após validação",
        rawPreview: String(content).slice(0, 300)
      });
    }

    // “cara de prova”: alterna mcq/ce
    let questoes = interleave(saneMCQ, saneCE);

    // corta para o total pedido
    questoes = questoes.slice(0, QTD_TOTAL);

    return res.status(200).json({
      ok: true,
      questoes,
      discursivas: [], // ✅ contrato estável (no modo OBJ é vazio)
      meta: {
        mode: "obj",
        banca: BANCA,
        perfilBanca: profile.id,
        dificuldade: DIFICULDADE,
        tema: TEMA,
        qtdTotal: QTD_TOTAL,
        qtdMCQ: QTD_MCQ,
        qtdCE: QTD_CE,
        qtdDiscursivas: 0
      }
    });
  } catch (err) {
    console.error("❌ gerarSimulado error:", err);
    return empty(500, {
      error: "Falha interna ao gerar simulado",
      detail: String(err?.message || err)
    });
  }
}
