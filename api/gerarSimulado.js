// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO (SEM SDK openai)
// - Chama OpenAI via fetch direto
// - Retorna SEMPRE JSON
//
// Mistura:
// - MCQ  (tipo="mcq"): enunciado + alternativas(4) + corretaIndex + explicacao
// - CE   (tipo="ce"):  enunciado(assertiva) + alternativas(2) + corretaIndex + explicacao
// - Disc (separado):   enunciado + respostaModelo + criterios[]
//
// Saída:
// {
//   ok: true,
//   questoes: [ {tipo:"mcq"| "ce", ...} ],   // qtdTotal itens
//   ce: [ {tipo:"ce", ...} ],               // redundante (facilita UI futura)
//   discursivas: [ { ... } ],
//   meta: { ... }
// }
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
        "Estilo de prova: assertivas, precisão conceitual, exceções e detalhes. Linguagem técnica, direta. Pegadinhas semânticas. Para CE (Certo/Errado), use assertivas objetivas e plausíveis."
    };
  }
  if (b.includes("FCC")) {
    return {
      id: "FCC",
      nome: "FCC",
      estilo:
        "Enunciado um pouco mais descritivo, cobra definição + aplicação. Distratores com termos parecidos. Linguagem formal."
    };
  }
  if (b.includes("VUNESP")) {
    return {
      id: "VUNESP",
      nome: "VUNESP",
      estilo:
        "Objetiva e escolar, comandos claros. Alternativas bem separadas. Contexto prático quando útil. Evite armadilhas excessivas."
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
      "Alternativas muito plausíveis e próximas, cobra interpretação e aplicação. Pegadinhas sutis (termos absolutos, exceções, nuances). Enunciado direto, mas exige atenção."
  };
}

// Helpers de saneamento por tipo
function normalizeTipo(t) {
  const v = String(t || "").toLowerCase().trim();
  if (v === "ce" || v === "certoerrado" || v === "certo/errado") return "ce";
  return "mcq";
}

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

function toStr(x) {
  return String(x ?? "").trim();
}

function defaultCEAlternativas() {
  return ["Certo", "Errado"];
}

// Mock simples (fallback) para completar “buracos”
function buildMockMCQ({ banca, tema }) {
  const t = tema || "Geral";
  const b = banca || "FGV";
  return {
    tipo: "mcq",
    enunciado: `(${b}) Em ${t}, qual alternativa está correta?`,
    alternativas: [
      "Afirmação correta e consistente com o conceito",
      "Afirmação que confunde definição com exemplo",
      "Afirmação que usa um termo de forma indevida",
      "Afirmação que ignora uma exceção importante"
    ],
    corretaIndex: 0,
    explicacao: "A alternativa correta mantém o conceito e não viola as restrições do tema."
  };
}

function buildMockCE({ banca, tema }) {
  const t = tema || "Geral";
  const b = banca || "CEBRASPE";
  return {
    tipo: "ce",
    enunciado: `(${b}) No contexto de ${t}, é correto afirmar que uma definição sempre independe do contexto de aplicação.`,
    alternativas: defaultCEAlternativas(),
    corretaIndex: 1,
    explicacao: "Em muitos domínios, definições e propriedades variam conforme hipóteses e contexto."
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Use POST" });
    }

    // Parâmetros esperados do front/console
    // qtd = total de questões objetivas (MCQ+CE) dentro de questoes
    // qtdCE = quantas dessas serão CE (2 alternativas)
    // qtdDiscursivas = quantas discursivas (separadas)
    const {
      banca,
      qtd,
      dificuldade,
      tema,
      qtdCE,
      qtdDiscursivas
    } = req.body || {};

    const QTD_TOTAL = clamp(qtd ?? 5, 3, 30);
    const QTD_CE = clamp(qtdCE ?? 0, 0, QTD_TOTAL);        // CE dentro de questoes
    const QTD_MCQ = clamp(QTD_TOTAL - QTD_CE, 0, QTD_TOTAL);
    const QTD_DISC = clamp(qtdDiscursivas ?? 0, 0, 10);    // discursivas separadas

    const BANCA = String(banca || "FGV");
    const DIFICULDADE = String(dificuldade || "misturado");
    const TEMA = String(tema || "").trim();

    const profile = bancaProfile(BANCA);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY ausente no ambiente"
      });
    }

    // ----------------------------------------------------------
    // PROMPT: pede JSON rigoroso + mistura de formatos
    // ----------------------------------------------------------
    const prompt = `
Você é um gerador de questões de simulado com estilo de banca.

BANCA: ${profile.nome}
PERFIL DA BANCA (aplique rigorosamente):
${profile.estilo}

DIFICULDADE: ${DIFICULDADE}
TEMA: ${TEMA ? `"${TEMA}"` : "Livre (tema geral da área)"}

OBJETIVO:
- Gerar exatamente ${QTD_TOTAL} questões OBJETIVAS no array "questoes"
  - Destas, ${QTD_MCQ} devem ser MCQ (tipo="mcq") com 4 alternativas
  - E ${QTD_CE} devem ser CE (tipo="ce") com 2 alternativas (Certo/Errado)
- Gerar exatamente ${QTD_DISC} questões DISCURSIVAS no array "discursivas"

REGRAS IMPORTANTES:
- NÃO use markdown.
- NÃO inclua letras A/B/C/D nas alternativas (o front faz isso).
- Evite emojis.
- Use linguagem compatível com a banca e com a dificuldade solicitada.
- Distratores devem ser plausíveis e coerentes, mas incorretos por detalhe/nuance.

SCHEMA (responda SOMENTE JSON válido, exatamente neste formato):

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
      "enunciado": "... (uma assertiva clara para julgar)",
      "alternativas": ["Certo","Errado"],
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

NOTAS:
- Em CE (tipo="ce"): o enunciado deve ser uma assertiva ou pergunta curta que se julga como Certo/Errado.
- Em CE: alternativas devem ser SEMPRE exatamente ["Certo","Errado"].
- corretaIndex: 0 significa "Certo", 1 significa "Errado".
- explicacao: 1 a 2 frases, objetiva, sem floreio.

DICA DE VARIAÇÃO:
- Varie comandos ("assinale", "é correto afirmar", "considere", "julgue o item", etc.) conforme o perfil da banca.
`.trim();

    // ----------------------------------------------------------
    // CHAMADA OPENAI
    // ----------------------------------------------------------
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

    // ----------------------------------------------------------
    // PARSE DO JSON
    // ----------------------------------------------------------
    let content = "";
    try {
      const data = JSON.parse(rawText);
      content = data?.choices?.[0]?.message?.content || "";
    } catch {
      content = "";
    }

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

    // ----------------------------------------------------------
    // SANEAMENTO: QUESTOES (MIX)
    // ----------------------------------------------------------
    const rawQuestoes = ensureArray(parsed.questoes);

    // Normaliza cada item para {tipo, enunciado, alternativas, corretaIndex, explicacao}
    const normalized = rawQuestoes
      .map((q) => {
        const tipo = normalizeTipo(q?.tipo);
        const enunciado = toStr(q?.enunciado);
        const explicacao = toStr(q?.explicacao);

        if (!enunciado) return null;

        if (tipo === "ce") {
          // CE: 2 alternativas fixas
          const alternativas = defaultCEAlternativas();
          const corretaIndex = clamp(q?.corretaIndex ?? 0, 0, 1);

          return {
            tipo: "ce",
            enunciado,
            alternativas,
            corretaIndex,
            explicacao
          };
        }

        // MCQ: 4 alternativas
        const alts = ensureArray(q?.alternativas).map((a) => toStr(a)).filter(Boolean);
        if (alts.length < 4) return null;

        return {
          tipo: "mcq",
          enunciado,
          alternativas: alts.slice(0, 4),
          corretaIndex: clamp(q?.corretaIndex ?? 0, 0, 3),
          explicacao
        };
      })
      .filter(Boolean);

    // Se o modelo veio com contagens “estranhas”, nós reequilibramos:
    // - Garantir até QTD_TOTAL no array final
    // - Priorizar manter QTD_CE CE e QTD_MCQ MCQ (na medida do possível)
    const ceItems = normalized.filter((q) => q.tipo === "ce");
    const mcqItems = normalized.filter((q) => q.tipo === "mcq");

    // Seleciona o que precisa
    const pickedCE = ceItems.slice(0, QTD_CE);
    const pickedMCQ = mcqItems.slice(0, QTD_MCQ);

    let saneQuestoes = [...pickedMCQ, ...pickedCE];

    // Se faltou, completa com mocks do tipo que estiver faltando
    const need = QTD_TOTAL - saneQuestoes.length;
    if (need > 0) {
      // tenta completar primeiro MCQ, depois CE (ou vice-versa)
      for (let i = 0; i < need; i++) {
        // decide o tipo pelo “saldo”
        const haveCE = saneQuestoes.filter((x) => x.tipo === "ce").length;
        const haveMCQ = saneQuestoes.filter((x) => x.tipo === "mcq").length;

        if (haveMCQ < QTD_MCQ) {
          saneQuestoes.push(buildMockMCQ({ banca: BANCA, tema: TEMA }));
        } else if (haveCE < QTD_CE) {
          saneQuestoes.push(buildMockCE({ banca: profile.nome, tema: TEMA }));
        } else {
          // se já bateu as metas, completa com MCQ
          saneQuestoes.push(buildMockMCQ({ banca: BANCA, tema: TEMA }));
        }
      }
    }

    // Se veio demais, corta
    saneQuestoes = saneQuestoes.slice(0, QTD_TOTAL);

    // ----------------------------------------------------------
    // DISCUSSIVAS (OPCIONAIS, SEPARADAS)
    // ----------------------------------------------------------
    const rawDisc = Array.isArray(parsed.discursivas) ? parsed.discursivas : [];
    const saneDisc = rawDisc
      .map((d) => {
        const enunciado = toStr(d?.enunciado);
        const respostaModelo = toStr(d?.respostaModelo);
        const criterios = ensureArray(d?.criterios).map((c) => toStr(c)).filter(Boolean);

        if (!enunciado || !respostaModelo || criterios.length < 2) return null;

        return {
          enunciado,
          respostaModelo,
          criterios: criterios.slice(0, 8)
        };
      })
      .filter(Boolean)
      .slice(0, QTD_DISC);

    // Se pediu discursivas e veio menos, completa com placeholders “seguros”
    if (QTD_DISC > saneDisc.length) {
      const miss = QTD_DISC - saneDisc.length;
      for (let i = 0; i < miss; i++) {
        saneDisc.push({
          enunciado: `(${profile.nome}) Explique, de forma objetiva, um conceito central de ${TEMA || "um tema relevante da área"} e indique implicações práticas.`,
          respostaModelo:
            "Resposta esperada: definição clara do conceito, delimitação do escopo e um exemplo de aplicação. Deve apontar pelo menos uma implicação prática e uma limitação/condição.",
          criterios: [
            "Define corretamente o conceito",
            "Delimita escopo/condições",
            "Apresenta exemplo coerente",
            "Indica implicação prática",
            "Aponta limitação ou exceção"
          ]
        });
      }
    }

    // ----------------------------------------------------------
    // CE SEPARADO (redundante): útil para UI futura
    // ----------------------------------------------------------
    const saneCE = saneQuestoes.filter((q) => q.tipo === "ce").slice(0, QTD_CE);

    // ----------------------------------------------------------
    // VALIDAÇÃO FINAL
    // ----------------------------------------------------------
    if (!saneQuestoes.length) {
      return res.status(200).json({
        ok: false,
        error: "Questões inválidas após validação",
        rawPreview: String(content).slice(0, 300)
      });
    }

    // Meta útil para debug + analytics
    return res.status(200).json({
      ok: true,
      questoes: saneQuestoes,     // ✅ mix mcq + ce (qtdTotal)
      ce: saneCE,                 // ✅ redundante
      discursivas: saneDisc,      // ✅ separado (UI futura)
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
