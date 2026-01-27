// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO (SEM SDK openai)
// - Chama OpenAI via fetch direto
// - Retorna SEMPRE JSON
//
// Compatibilidade:
// - `questoes` = MCQ (4 alternativas) -> front atual
// - `ce` = Certo/Errado (alternativas ["Certo","Errado"]) -> UI futura
// - `discursivas` -> UI futura
//
// Mix (novo):
// - req.body.qtd = TOTAL de questões OBJETIVAS (MCQ + CE)
// - req.body.qtdCE (opcional) = quantas serão Certo/Errado
// - req.body.qtdDiscursivas (opcional) = quantas discursivas
//
// Se qtdCE não vier:
// - usa mix padrão do blueprint da banca
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

// ==========================================================
// ✅ BLUEPRINTS (DNA de banca)
// ==========================================================
const BANK_BLUEPRINTS = [
  {
    id: "CEBRASPE",
    match: ["CEBRASPE", "CESPE"],
    nome: "CESPE/CEBRASPE",
    defaultMix: { cePct: 0.75 }, // 75% CE se qtdCE não vier
    comandos: {
      mcq: ["Assinale a alternativa correta.", "É correto afirmar que:", "Considere a situação e assinale:"],
      ce: [
        "Julgue o item a seguir (C/E).",
        "Considere a assertiva e julgue (C/E):",
        "À luz do tema, julgue o item (C/E):"
      ],
      disc: ["Discorra sobre:", "Explique, de forma objetiva:", "Justifique:"]
    },
    estilo: [
      "Assertivas verificáveis, precisão conceitual e semântica.",
      "Pegadinhas: exceções, trocas sutis de termos, generalizações indevidas.",
      "Evitar contextualização longa e evitar linguagem informal."
    ],
    distratores: [
      "Nos itens CE, crie erros por detalhe: condição faltando, escopo trocado, termo absoluto indevido.",
      "Em MCQ (quando houver), alternativas muito próximas e técnicas."
    ],
    guardrails: [
      "Evite itens dependentes de jurisprudência/data específica (a não ser que o tema peça).",
      "Nada de 'sempre'/'nunca' sem forte justificativa: use com parcimônia para gerar itens falsos plausíveis."
    ]
  },

  {
    id: "FGV",
    match: ["FGV"],
    nome: "FGV",
    defaultMix: { cePct: 0.0 },
    comandos: {
      mcq: [
        "Assinale a alternativa correta.",
        "Assinale a opção que melhor se aplica ao caso.",
        "Considere o enunciado e assinale:",
        "À luz do tema, assinale:"
      ],
      ce: [],
      disc: ["Analise e responda:", "Explique e exemplifique:", "Compare e conclua:"]
    },
    estilo: [
      "Alta plausibilidade dos distratores, alternativas muito próximas.",
      "Cobra interpretação + aplicação. Armadilhas sutis: termos absolutos, exceções, nuances.",
      "Enunciado direto, mas exige atenção fina em definições e condições."
    ],
    distratores: [
      "Crie 2 alternativas quase corretas (erram por 1 condição).",
      "Use termos técnicos semelhantes (ex.: 'autorização' vs 'consentimento', 'esquema' vs 'instância').",
      "Evite alternativa obviamente errada."
    ],
    guardrails: [
      "Não repita padrão de corretaIndex; distribua 0..3 ao longo do simulado.",
      "Evite alternativas com comprimentos muito discrepantes."
    ]
  },

  {
    id: "FCC",
    match: ["FCC"],
    nome: "FCC",
    defaultMix: { cePct: 0.0 },
    comandos: {
      mcq: [
        "Assinale a alternativa correta.",
        "Considere as afirmações a seguir e assinale:",
        "É correto afirmar que:",
        "No contexto apresentado, assinale:"
      ],
      ce: [],
      disc: ["Defina e exemplifique:", "Explique e diferencie:", "Descreva e justifique:"]
    },
    estilo: [
      "Enunciado moderadamente descritivo: definição + aplicação.",
      "Distratores com termos parecidos e confusões clássicas.",
      "Linguagem formal; cobra conceitos canônicos."
    ],
    distratores: [
      "Um distrator troca definição por exemplo.",
      "Um distrator confunde conceito correlato (ex.: integridade vs consistência).",
      "Um distrator erra por inversão (causa/efeito)."
    ],
    guardrails: [
      "Evite pegadinhas excessivamente semânticas (mais 'conceito e aplicação')."
    ]
  },

  {
    id: "VUNESP",
    match: ["VUNESP"],
    nome: "VUNESP",
    defaultMix: { cePct: 0.0 },
    comandos: {
      mcq: [
        "Assinale a alternativa correta.",
        "No enunciado, assinale:",
        "Considerando o texto, assinale:",
        "Indique a opção correta:"
      ],
      ce: [],
      disc: ["Responda de forma objetiva:", "Explique:", "Apresente um exemplo:"]
    },
    estilo: [
      "Objetiva, comandos claros e diretos.",
      "Menos armadilhas; separação nítida entre alternativas.",
      "Contexto prático quando ajuda."
    ],
    distratores: [
      "Distratores plausíveis, porém com erro conceitual evidente para quem estudou.",
      "Evite alternativas quase idênticas (mais didática)."
    ],
    guardrails: ["Não alongar enunciado sem necessidade."]
  },

  {
    id: "IBFC",
    match: ["IBFC"],
    nome: "IBFC",
    defaultMix: { cePct: 0.0 },
    comandos: {
      mcq: ["Assinale a alternativa correta.", "Marque a opção correta:", "Indique a alternativa correta:"],
      ce: [],
      disc: ["Explique objetivamente:", "Descreva:", "Diferencie:"]
    },
    estilo: [
      "Direta e literal.",
      "Foco no essencial: conceitos e procedimentos.",
      "Alternativas curtas, bem objetivas."
    ],
    distratores: [
      "Distratores por troca de termo/definição.",
      "Evite contextualização longa."
    ],
    guardrails: ["Manter simplicidade e objetividade."]
  },

  {
    id: "AOCP",
    match: ["AOCP"],
    nome: "AOCP",
    defaultMix: { cePct: 0.0 },
    comandos: {
      mcq: [
        "Assinale a alternativa correta.",
        "No contexto apresentado, assinale:",
        "Considerando o tema, marque a correta:"
      ],
      ce: [],
      disc: ["Explique e justifique:", "Descreva e exemplifique:", "Compare:"]
    },
    estilo: [
      "Intermediária: enunciado claro, cobra aplicação.",
      "Alternativas plausíveis, sem textos enormes."
    ],
    distratores: [
      "1 distrator muito plausível (erro por detalhe).",
      "2 distratores medianos (erro conceitual).",
      "1 distrator mais fraco (mas não bobo)."
    ],
    guardrails: ["Evitar excesso de pegadinhas semânticas."]
  }
];

function getBlueprint(bancaRaw) {
  const b = String(bancaRaw || "").toUpperCase();
  for (const bp of BANK_BLUEPRINTS) {
    if (bp.match.some((m) => b.includes(String(m).toUpperCase()))) return bp;
  }
  // fallback: FGV
  return BANK_BLUEPRINTS.find((x) => x.id === "FGV");
}

function diffGuide(dificuldadeRaw) {
  const d = String(dificuldadeRaw || "misturado").toLowerCase();

  const guides = {
    facil: [
      "Cobrar 1 conceito por questão.",
      "Evitar exceções raras e condições múltiplas.",
      "Enunciados curtos e diretos."
    ],
    medio: [
      "Cobra conceito + aplicação simples.",
      "Pode exigir comparar duas ideias próximas.",
      "Distratores plausíveis com 1 detalhe errado."
    ],
    dificil: [
      "Exigir 2 passos de raciocínio ou uma exceção relevante.",
      "Distratores MUITO próximos (erro por nuance).",
      "Pode misturar conceitos correlatos com precisão."
    ],
    misturado: [
      "Misture fácil/médio/difícil: ~30/50/20, sem mencionar isso no texto.",
      "Varie comandos e temas dentro do assunto."
    ]
  };

  return guides[d] || guides.misturado;
}

function normalizeMCQ(arr, qtd) {
  const out = (Array.isArray(arr) ? arr : [])
    .filter(
      (q) =>
        q &&
        typeof q.enunciado === "string" &&
        Array.isArray(q.alternativas) &&
        q.alternativas.length >= 4
    )
    .slice(0, qtd)
    .map((q) => {
      const alts = q.alternativas.slice(0, 4).map((a) => String(a).trim());
      const uniq = new Set(alts.map((x) => x.toLowerCase()));
      if (uniq.size < 4) {
        for (let i = 0; i < alts.length; i++) alts[i] = `${alts[i]} `;
      }

      return {
        enunciado: String(q.enunciado).trim(),
        alternativas: alts,
        corretaIndex: clamp(q.corretaIndex ?? 0, 0, 3),
        explicacao: String(q.explicacao || "").trim()
      };
    });

  return out;
}

function normalizeCE(arr, qtd) {
  const out = (Array.isArray(arr) ? arr : [])
    .filter((x) => x && typeof x.enunciado === "string")
    .slice(0, qtd)
    .map((x) => {
      let idx = 0;

      if (typeof x.corretaIndex === "number") {
        idx = clamp(x.corretaIndex, 0, 1);
      } else {
        const c = String(x.correta || "").trim().toUpperCase();
        idx = c === "E" ? 1 : 0;
      }

      return {
        enunciado: String(x.enunciado).trim(),
        alternativas: ["Certo", "Errado"],
        corretaIndex: idx,
        explicacao: String(x.explicacao || "").trim()
      };
    });

  return out;
}

function normalizeDisc(arr, qtd) {
  const out = (Array.isArray(arr) ? arr : [])
    .filter(
      (d) =>
        d &&
        typeof d.enunciado === "string" &&
        typeof d.respostaModelo === "string" &&
        Array.isArray(d.criterios) &&
        d.criterios.length >= 2
    )
    .slice(0, qtd)
    .map((d) => ({
      enunciado: String(d.enunciado).trim(),
      respostaModelo: String(d.respostaModelo).trim(),
      criterios: d.criterios.slice(0, 8).map((c) => String(c).trim())
    }));

  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Use POST" });
    }

    const { banca, qtd, dificuldade, tema, qtdCE, qtdDiscursivas } = req.body || {};

    const TOTAL_OBJ = clamp(qtd ?? 5, 3, 30);
    const QTD_DISC = clamp(qtdDiscursivas ?? 0, 0, 10);

    const BANCA = String(banca || "FGV");
    const DIFICULDADE = String(dificuldade || "misturado");
    const TEMA = String(tema || "").trim();

    const bp = getBlueprint(BANCA);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "OPENAI_API_KEY ausente no ambiente" });
    }

    // qtdCE: se vier, respeita. senão, usa blueprint.defaultMix.cePct
    const defaultCE = typeof qtdCE === "number"
      ? clamp(qtdCE, 0, TOTAL_OBJ)
      : clamp(Math.round(TOTAL_OBJ * (bp.defaultMix?.cePct ?? 0)), 0, TOTAL_OBJ);

    const QTD_CE = clamp(defaultCE, 0, TOTAL_OBJ);
    const QTD_MCQ = clamp(TOTAL_OBJ - QTD_CE, 0, TOTAL_OBJ);

    const diffRules = diffGuide(DIFICULDADE);

    const prompt = `
Você é um gerador de questões de simulado com estilo de banca.

BANCA: ${bp.nome}
DIFICULDADE: ${DIFICULDADE}
TEMA: ${TEMA ? `"${TEMA}"` : "Livre (tema geral da área)"}

ESTILO DA BANCA (aplique rigorosamente):
- ${bp.estilo.join("\n- ")}

REGRAS DE DISTRATORES (aplique):
- ${bp.distratores.join("\n- ")}

GUARDRAILS (não viole):
- ${bp.guardrails.join("\n- ")}

AJUSTE POR DIFICULDADE:
- ${diffRules.join("\n- ")}

COMANDOS (varie e não repita o mesmo em sequência):
MCQ: ${bp.comandos.mcq.length ? bp.comandos.mcq.join(" | ") : "(não usar)"}
CE: ${bp.comandos.ce.length ? bp.comandos.ce.join(" | ") : "(não usar)"}
DISC: ${bp.comandos.disc.join(" | ")}

SAÍDA:
- Gere exatamente ${QTD_MCQ} questões MCQ (4 alternativas).
- Gere exatamente ${QTD_CE} itens de CERTO/ERRADO.
- Gere exatamente ${QTD_DISC} questões DISCURSIVAS (se QTD_DISC=0, retorne []).

REGRAS IMPORTANTES:
- NÃO use markdown.
- NÃO use emojis.
- NÃO inclua letras A/B/C/D nas alternativas de MCQ.
- MCQ: 4 alternativas, 1 correta, corretaIndex 0..3, explicacao objetiva (2 a 4 linhas).
- CE: escreva como assertiva verificável; correta é "C" ou "E"; explicacao objetiva.
- Distribua corretaIndex nas MCQ sem viés (evite repetir o mesmo índice várias vezes).
- Evite alternativas com comprimentos muito discrepantes.

SCHEMAS:

1) MCQ:
{
  "enunciado": "...",
  "alternativas": ["...", "...", "...", "..."],
  "corretaIndex": 0,
  "explicacao": "..."
}

2) CERTO/ERRADO:
{
  "enunciado": "...",
  "correta": "C" ou "E",
  "explicacao": "..."
}

3) DISCURSIVA:
{
  "enunciado": "...",
  "respostaModelo": "... (4 a 8 linhas no máximo)",
  "criterios": ["...", "...", "..."]
}

FORMATO DE RESPOSTA:
Responda SOMENTE em JSON válido, exatamente assim:

{
  "mcq": [ ... ],
  "ce": [ ... ],
  "discursivas": [ ... ]
}

CHECK FINAL (faça antes de responder):
- MCQ: 4 alternativas distintas; 1 correta; explicação condizente com o gabarito.
- CE: assertiva verificável; correta coerente; explicação coerente.
- Disc: respostaModelo curta; critérios objetivos.
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
        max_tokens: 2300,
        messages: [
          {
            role: "system",
            content:
              "Você gera simulado em JSON rigoroso. Responda apenas JSON válido conforme o schema pedido, sem texto extra."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const rawText = await resp.text();

    if (!resp.ok) {
      let errJson = null;
      try { errJson = JSON.parse(rawText); } catch {}
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
      const trimmed = String(content).trim();
      if (trimmed.startsWith("{")) parsed = JSON.parse(trimmed);
    } catch {}

    if (!parsed) parsed = extractJsonObject(content);

    if (!parsed || typeof parsed !== "object") {
      return res.status(200).json({
        ok: false,
        error: "Modelo não retornou JSON no formato esperado",
        rawPreview: String(content).slice(0, 300)
      });
    }

    const saneMCQ = normalizeMCQ(parsed.mcq, QTD_MCQ);
    const saneCE = normalizeCE(parsed.ce, QTD_CE);
    const saneDisc = normalizeDisc(parsed.discursivas, QTD_DISC);

    if (!saneMCQ.length && QTD_MCQ > 0) {
      return res.status(200).json({
        ok: false,
        error: "MCQ inválidas após validação",
        rawPreview: String(content).slice(0, 300)
      });
    }

    return res.status(200).json({
      ok: true,
      questoes: saneMCQ,     // ✅ front atual
      ce: saneCE,            // ✅ UI futura
      discursivas: saneDisc, // ✅ UI futura
      meta: {
        banca: BANCA,
        blueprint: bp.id,
        dificuldade: DIFICULDADE,
        tema: TEMA,
        qtdTotalObjetivas: TOTAL_OBJ,
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
