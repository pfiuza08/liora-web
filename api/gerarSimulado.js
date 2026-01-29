// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO (SEM SDK OpenAI)
// - Chama OpenAI via fetch direto
// - Retorna SEMPRE JSON
// - Objetivas: MCQ (4 alts) + CE (2 alts: Certo/Errado)
// - Discursivas: enunciado + respostaModelo + criterios[]
//
// INPUT (POST JSON):
// { banca, qtd, dificuldade, tema, qtdCE, qtdDiscursivas }
//
// OUTPUT (JSON):
// {
//   ok: true,
//   questoes: [ { tipo: "mcq"|"ce", enunciado, alternativas, corretaIndex, explicacao } ],
//   discursivas: [ { enunciado, respostaModelo, criterios } ],
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

function normalizeBancaName(raw) {
  const b = String(raw || "").toUpperCase();
  if (b.includes("CEBRASPE") || b.includes("CESPE")) return "CESPE/CEBRASPE";
  if (b.includes("FCC")) return "FCC";
  if (b.includes("VUNESP")) return "VUNESP";
  if (b.includes("IBFC")) return "IBFC";
  if (b.includes("AOCP")) return "AOCP";
  return "FGV";
}

// Micro-regras por banca: comandos, armadilhas e “pegada”
function bancaProfile(bancaRaw) {
  const banca = normalizeBancaName(bancaRaw);

  if (banca === "CESPE/CEBRASPE") {
    return {
      id: "CEBRASPE",
      nome: "CESPE/CEBRASPE",
      estiloBase:
        "Estilo assertivo com proposições. Precisão conceitual e exceções. Distratores por nuance semântica. Linguagem técnica e direta. Evite floreio.",
      comandos: [
        "Julgue o item a seguir",
        "Considerando o texto, julgue",
        "Assinale a opção correta"
      ],
      armadilhas: [
        "termos absolutos (sempre, nunca) quando não cabem",
        "exceções e condições necessárias",
        "troca sutil de conceito"
      ],
      preferenciaTipos: { ce: 0.55, mcq: 0.45 }
    };
  }

  if (banca === "FCC") {
    return {
      id: "FCC",
      nome: "FCC",
      estiloBase:
        "Enunciado um pouco mais descritivo, cobra definição e aplicação. Distratores com termos muito próximos. Linguagem formal e objetiva.",
      comandos: ["Assinale a alternativa correta", "É correto afirmar", "Considere"],
      armadilhas: [
        "conceitos parecidos (normalização vs integridade, etc.)",
        "definição correta com aplicação sutil",
        "termo técnico trocado por sinônimo inadequado"
      ],
      preferenciaTipos: { ce: 0.15, mcq: 0.85 }
    };
  }

  if (banca === "VUNESP") {
    return {
      id: "VUNESP",
      nome: "VUNESP",
      estiloBase:
        "Objetiva e escolar. Comandos claros. Alternativas bem separadas. Contexto prático quando ajuda. Pouca malícia, mais literalidade.",
      comandos: ["Assinale a alternativa correta", "Indique a opção correta", "Considere"],
      armadilhas: [
        "confusão de termos básicos",
        "exemplo prático com detalhe definidor",
        "procedimento correto vs incompleto"
      ],
      preferenciaTipos: { ce: 0.10, mcq: 0.90 }
    };
  }

  if (banca === "IBFC") {
    return {
      id: "IBFC",
      nome: "IBFC",
      estiloBase:
        "Direta e literal. Foco no essencial. Cobrança de conceitos e procedimentos. Alternativas curtas e objetivas.",
      comandos: ["Assinale a alternativa correta", "É correto afirmar", "Indique"],
      armadilhas: [
        "literalidade do conceito",
        "definição exata",
        "passo de procedimento omitido"
      ],
      preferenciaTipos: { ce: 0.12, mcq: 0.88 }
    };
  }

  if (banca === "AOCP") {
    return {
      id: "AOCP",
      nome: "AOCP",
      estiloBase:
        "Intermediária. Enunciado claro e direto, cobra aplicação. Distratores plausíveis. Evite textos longos.",
      comandos: ["Assinale a alternativa correta", "Considere", "É correto afirmar"],
      armadilhas: [
        "aplicação com detalhe",
        "troca de condição",
        "conceito próximo"
      ],
      preferenciaTipos: { ce: 0.18, mcq: 0.82 }
    };
  }

  // Default: FGV
  return {
    id: "FGV",
    nome: "FGV",
    estiloBase:
      "Alternativas muito plausíveis e próximas. Cobra interpretação e aplicação. Pegadinhas sutis (absolutismos, exceções, nuances). Enunciado direto, mas exige atenção.",
    comandos: ["Assinale a alternativa correta", "É correto afirmar", "Considere"],
    armadilhas: [
      "termos absolutos (sempre/nunca) e generalizações",
      "exceções e casos-limite",
      "conceitos corretos em contexto errado"
    ],
    preferenciaTipos: { ce: 0.20, mcq: 0.80 }
  };
}

function inferQtdCE(profile, qtdTotal) {
  // regra simples e prática: aplica preferência da banca
  const p = profile?.preferenciaTipos?.ce ?? 0.2;
  const suggested = Math.round(qtdTotal * p);
  // mantém pelo menos 0 e no máximo qtdTotal
  return clamp(suggested, 0, qtdTotal);
}

function ensureArray(x) {
  return Array.isArray(x) ? x : [];
}

function str(x) {
  return String(x ?? "").trim();
}

function sanitizeAlternatives(alts, expectedLen) {
  const arr = ensureArray(alts)
    .map((a) => str(a))
    .filter(Boolean);

  if (expectedLen === 2) {
    // sempre força Certo/Errado para padronizar UI
    return ["Certo", "Errado"];
  }

  // expectedLen = 4
  const out = arr.slice(0, 4);
  while (out.length < 4) out.push("Alternativa indisponível");
  return out;
}

function pickCommands(profile) {
  const cmds = ensureArray(profile?.comandos);
  if (!cmds.length) return "Assinale a alternativa correta";
  // escolhe 2-3 comandos para variar
  const unique = [...new Set(cmds)];
  return unique.slice(0, Math.min(3, unique.length)).join(" | ");
}

function buildPrompt({ profile, dificuldade, tema, qtdMCQ, qtdCE, qtdDisc }) {
  const comandos = pickCommands(profile);
  const armadilhas = ensureArray(profile?.armadilhas).slice(0, 5).join("; ");

  const temaTxt = tema ? `"${tema}"` : "Livre (tema geral da área)";
  const dif = dificuldade || "misturado";

  return `
Você é um gerador de questões de simulado com estilo de banca.

BANCA: ${profile.nome}
ESTILO BASE (aplique rigorosamente):
${profile.estiloBase}

MICRO-REGRAS DA BANCA:
- Comandos típicos (varie entre eles): ${comandos}
- Armadilhas/nuances (use em parte das questões, sem exagero): ${armadilhas}
- Sem humor, sem emojis, linguagem de prova.

DIFICULDADE: ${dif}
TEMA: ${temaTxt}

OBJETIVAS:
- Gere exatamente ${qtdMCQ} questões do tipo "mcq" (4 alternativas).
- Gere exatamente ${qtdCE} questões do tipo "ce" (Certo/Errado).

DISCURSIVAS:
- Gere exatamente ${qtdDisc} questões discursivas.

REGRAS IMPORTANTES:
- NÃO use markdown.
- NÃO inclua letras A/B/C/D no texto das alternativas.
- Para "ce": alternativas DEVEM ser exatamente ["Certo","Errado"].
- Cada objetiva deve ter:
  - tipo: "mcq" ou "ce"
  - enunciado: string
  - alternativas: array (4 strings no mcq; 2 strings no ce)
  - corretaIndex: inteiro (0..3 no mcq; 0..1 no ce)
  - explicacao: 1 a 2 frases, direta e útil (sem floreio)
- Cada discursiva deve ter:
  - enunciado: string
  - respostaModelo: 4 a 8 linhas
  - criterios: 3 a 6 itens curtos

QUALIDADE:
- Distratores devem ser plausíveis e coerentes com o tema, mas incorretos por um detalhe.
- Evite “pistas” óbvias (como repetir a palavra do enunciado só na correta).
- Varie assuntos e enfoque dentro do tema, quando possível.

FORMATO: responda SOMENTE em JSON válido, exatamente assim:

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
`.trim();
}

async function callOpenAI({ apiKey, prompt }) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.35,
      max_tokens: 4200,
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
    return {
      ok: false,
      status: resp.status,
      detail: errJson?.error?.message || rawText.slice(0, 400),
      rawText
    };
  }

  let data = null;
  try {
    data = JSON.parse(rawText);
  } catch {
    return { ok: false, status: 500, detail: "Resposta OpenAI não é JSON", rawText };
  }

  const content = data?.choices?.[0]?.message?.content || "";
  return { ok: true, content, rawText };
}

function safeParseModelJSON(content) {
  const txt = String(content || "").trim();
  if (!txt) return null;

  if (txt.startsWith("{")) {
    try {
      return JSON.parse(txt);
    } catch {}
  }
  return extractJsonObject(txt);
}

// fallback simples, só para completar faltantes
function fallbackMCQ(profileName, tema) {
  const t = tema || "Conteúdo geral";
  return {
    tipo: "mcq",
    enunciado: `(${profileName}) Em ${t}, qual alternativa está mais correta?`,
    alternativas: [
      "Afirmação correta em contexto adequado",
      "Afirmação correta em contexto inadequado",
      "Afirmação incompleta e genérica",
      "Afirmação com termo técnico trocado"
    ],
    corretaIndex: 0,
    explicacao: "A alternativa correta respeita o conceito e o contexto; as demais falham por detalhe."
  };
}

function fallbackCE(profileName, tema) {
  const t = tema || "Conteúdo geral";
  return {
    tipo: "ce",
    enunciado: `(${profileName}) Em ${t}, a assertiva apresentada está correta.`,
    alternativas: ["Certo", "Errado"],
    corretaIndex: 1,
    explicacao: "A assertiva é incorreta por desconsiderar uma condição necessária ou exceção relevante."
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Use POST" });
    }

    const body = req.body || {};

    const BANCA = String(body.banca || "FGV");
    const DIFICULDADE = String(body.dificuldade || "misturado");
    const TEMA = String(body.tema || "").trim();

    const profile = bancaProfile(BANCA);

    const QTD_TOTAL = clamp(body.qtd ?? 5, 3, 30);

    // qtdCE pode vir do front. Se não vier, inferimos pela banca.
    const rawQtdCE =
      body.qtdCE == null ? inferQtdCE(profile, QTD_TOTAL) : clamp(body.qtdCE, 0, QTD_TOTAL);

    const QTD_CE = clamp(rawQtdCE, 0, QTD_TOTAL);
    const QTD_MCQ = clamp(QTD_TOTAL - QTD_CE, 0, QTD_TOTAL);

    const QTD_DISC = clamp(body.qtdDiscursivas ?? 0, 0, 10);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY ausente no ambiente"
      });
    }

    const prompt = buildPrompt({
      profile,
      dificuldade: DIFICULDADE,
      tema: TEMA,
      qtdMCQ: QTD_MCQ,
      qtdCE: QTD_CE,
      qtdDisc: QTD_DISC
    });

    const r1 = await callOpenAI({ apiKey, prompt });
    if (!r1.ok) {
      return res.status(500).json({
        ok: false,
        error: "OpenAI retornou erro",
        status: r1.status,
        detail: r1.detail
      });
    }

    const parsed = safeParseModelJSON(r1.content);
    if (!parsed) {
      return res.status(200).json({
        ok: false,
        error: "Modelo não retornou JSON no formato esperado",
        rawPreview: String(r1.content).slice(0, 400)
      });
    }

    const rawQuestoes = ensureArray(parsed.questoes);
    const rawDisc = ensureArray(parsed.discursivas);

    // --- saneamento objetivas ---
    const sane = [];
    for (const q of rawQuestoes) {
      const tipoRaw = String(q?.tipo || "").toLowerCase();
      const tipo = tipoRaw === "ce" ? "ce" : "mcq"; // default mcq
      const enunciado = str(q?.enunciado);

      if (!enunciado) continue;

      if (tipo === "ce") {
        sane.push({
          tipo: "ce",
          enunciado,
          alternativas: ["Certo", "Errado"],
          corretaIndex: clamp(q?.corretaIndex ?? 0, 0, 1),
          explicacao: str(q?.explicacao)
        });
      } else {
        sane.push({
          tipo: "mcq",
          enunciado,
          alternativas: sanitizeAlternatives(q?.alternativas, 4),
          corretaIndex: clamp(q?.corretaIndex ?? 0, 0, 3),
          explicacao: str(q?.explicacao)
        });
      }
    }

    // Se veio com mistura errada, reequilibra por contagem desejada
    const mcq = sane.filter((x) => x.tipo === "mcq");
    const ce = sane.filter((x) => x.tipo === "ce");

    // completa faltantes com fallback (barato e evita “sobrou 1 questão”)
    while (mcq.length < QTD_MCQ) mcq.push(fallbackMCQ(profile.nome, TEMA));
    while (ce.length < QTD_CE) ce.push(fallbackCE(profile.nome, TEMA));

    // corta excessos
    const mcqFinal = mcq.slice(0, QTD_MCQ);
    const ceFinal = ce.slice(0, QTD_CE);

    // intercala para ficar “natural”
    const questoesFinal = [];
    let i = 0,
      j = 0;
    while (questoesFinal.length < QTD_TOTAL) {
      // alternância simples: 2 mcq, 1 ce, repetindo (ajuda sensação de prova)
      if (i < mcqFinal.length) questoesFinal.push(mcqFinal[i++]);
      if (questoesFinal.length >= QTD_TOTAL) break;

      if (i < mcqFinal.length) questoesFinal.push(mcqFinal[i++]);
      if (questoesFinal.length >= QTD_TOTAL) break;

      if (j < ceFinal.length) questoesFinal.push(ceFinal[j++]);
      if (questoesFinal.length >= QTD_TOTAL) break;

      // se faltar de um tipo, preenche com o outro
      if (i >= mcqFinal.length && j < ceFinal.length) questoesFinal.push(ceFinal[j++]);
      if (j >= ceFinal.length && i < mcqFinal.length) questoesFinal.push(mcqFinal[i++]);
      if (i >= mcqFinal.length && j >= ceFinal.length) break;
    }

    // --- saneamento discursivas ---
    const discursivasFinal = rawDisc
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
        enunciado: str(d.enunciado),
        respostaModelo: str(d.respostaModelo),
        criterios: ensureArray(d.criterios).slice(0, 8).map((c) => str(c)).filter(Boolean)
      }));

    // garante explicação minimamente útil
    for (const q of questoesFinal) {
      if (!q.explicacao) {
        q.explicacao =
          q.tipo === "ce"
            ? "A assertiva depende de condição ou exceção do tema, e a alternativa correta reflete isso."
            : "A alternativa correta é a que atende ao conceito e ao contexto; as demais falham por detalhe relevante.";
      }
    }

    return res.status(200).json({
      ok: true,
      questoes: questoesFinal,
      ce: ceFinal, // opcional: útil para debug/telemetria
      discursivas: discursivasFinal,
      meta: {
        banca: normalizeBancaName(BANCA),
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
