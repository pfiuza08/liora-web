// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO (SEM SDK openai)
// - Chama OpenAI via fetch direto
// - Retorna SEMPRE JSON
// - Mix: MCQ (4 alts) + C/E (2 alts) + Discursivas (se solicitado)
// - Perfil por banca (heurística prática)
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
        "Enunciados com assertivas, foco em precisão conceitual, pegadinhas semânticas e exceções. Linguagem técnica e direta. Evite humor. Distratores muito plausíveis."
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
        "Objetiva e escolar, comandos claros. Alternativas bem separadas, sem excesso de armadilhas. Contexto prático quando útil."
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

// Fallback offline (mix)
function buildMock(config) {
  const qtdTotal = clamp(config.qtd ?? 5, 3, 30);
  const qtdCE = clamp(config.qtdCE ?? 0, 0, Math.min(10, qtdTotal));
  const qtdDisc = clamp(config.qtdDiscursivas ?? 0, 0, 10);

  const banca = config.banca || "FGV";
  const tema = config.tema || "Geral";

  const mcqBase = [
    {
      tipo: "mcq",
      enunciado: `(${banca}) Em ${tema}, qual alternativa descreve melhor o objetivo de uma revisão periódica?`,
      alternativas: [
        "Aumentar complexidade sem necessidade",
        "Identificar falhas e corrigir inconsistências",
        "Evitar documentação",
        "Substituir testes por opinião"
      ],
      corretaIndex: 1,
      explicacao: "Revisões periódicas servem para encontrar problemas e melhorar consistência e qualidade."
    },
    {
      tipo: "mcq",
      enunciado: `(${banca}) Qual é uma vantagem prática de estudar por questões (simulados)?`,
      alternativas: [
        "Ignorar teoria",
        "Treinar padrão de prova e consolidar conteúdo",
        "Garantir acerto sem revisão",
        "Evitar feedback"
      ],
      corretaIndex: 1,
      explicacao: "Simulados consolidam conteúdo e ajustam estratégia de prova."
    }
  ];

  const ceBase = [
    {
      tipo: "ce",
      enunciado: `(${banca}) A normalização em bancos de dados visa reduzir redundância e anomalias.`,
      alternativas: ["Certo", "Errado"],
      corretaIndex: 0,
      explicacao: "Normalização busca reduzir redundância e evitar anomalias de inserção/atualização/remoção."
    },
    {
      tipo: "ce",
      enunciado: `(${banca}) Chave primária pode aceitar valores nulos em um modelo relacional padrão.`,
      alternativas: ["Certo", "Errado"],
      corretaIndex: 1,
      explicacao: "Chave primária identifica unicamente a tupla, logo não deve ser nula."
    }
  ];

  const discBase = [
    {
      enunciado: `(${banca}) Explique a diferença entre esquema e instância de um banco de dados e dê um exemplo.`,
      respostaModelo:
        "Esquema descreve a estrutura (tabelas, atributos, relacionamentos e restrições) e muda pouco.\nInstância é o conjunto de dados em um momento específico e muda com frequência.\nEx.: esquema define tabela ALUNO(id, nome); instância são os registros atuais dessa tabela.",
      criterios: [
        "Definir corretamente esquema",
        "Definir corretamente instância",
        "Apresentar exemplo coerente",
        "Clareza e objetividade"
      ]
    }
  ];

  // Monta o mix
  const outQuest = [];
  const mcqNeed = Math.max(0, qtdTotal - qtdCE);

  for (let i = 0; i < mcqNeed; i++) {
    const it = mcqBase[i % mcqBase.length];
    outQuest.push({ ...it });
  }
  for (let i = 0; i < qtdCE; i++) {
    const it = ceBase[i % ceBase.length];
    outQuest.push({ ...it });
  }

  // embaralha levemente (mantém o mix)
  for (let i = outQuest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [outQuest[i], outQuest[j]] = [outQuest[j], outQuest[i]];
  }

  const outDisc = [];
  for (let i = 0; i < qtdDisc; i++) {
    outDisc.push({ ...discBase[i % discBase.length] });
  }

  return { questoes: outQuest.slice(0, qtdTotal), discursivas: outDisc.slice(0, qtdDisc) };
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
      // ✅ novos:
      qtdCE, // certo/errado
      qtdDiscursivas
    } = req.body || {};

    const QTD_TOTAL = clamp(qtd ?? 5, 3, 30);
    const QTD_CE = clamp(qtdCE ?? 0, 0, Math.min(10, QTD_TOTAL));
    const QTD_DISC = clamp(qtdDiscursivas ?? 0, 0, 10);

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

    // Prompt: mix em um único array `questoes`, com `tipo`
    const prompt = `
Você é um gerador de questões de simulado com estilo de banca.

BANCA: ${profile.nome}
PERFIL DA BANCA (aplique rigorosamente):
${profile.estilo}

DIFICULDADE: ${DIFICULDADE}
TEMA: ${TEMA ? `"${TEMA}"` : "Livre (tema geral da área)"}

SAÍDA:
- Gere exatamente ${QTD_TOTAL} questões no array "questoes", misturando:
  - MCQ (tipo="mcq") com 4 alternativas
  - C/E (tipo="ce") com 2 alternativas ("Certo","Errado")
- Dentro de "questoes": gere exatamente ${QTD_CE} do tipo "ce".
- As demais (QTD_TOTAL - ${QTD_CE}) devem ser "mcq".
- Gere exatamente ${QTD_DISC} questões discursivas no array "discursivas" (se QTD_DISC=0, retorne array vazio).

REGRAS IMPORTANTES:
- NÃO use markdown.
- NÃO inclua letras A/B/C/D nas alternativas (o front faz isso).
- Evite emojis.
- Para MCQ:
  - tipo: "mcq"
  - enunciado: string
  - alternativas: array de 4 strings
  - corretaIndex: 0..3
  - explicacao: 1 a 2 frases objetivas
- Para C/E:
  - tipo: "ce"
  - enunciado: string (uma afirmação)
  - alternativas: ["Certo","Errado"]
  - corretaIndex: 0 (Certo) ou 1 (Errado)
  - explicacao: 1 a 2 frases objetivas
- Para discursivas:
  - enunciado: string
  - respostaModelo: string (4 a 8 linhas)
  - criterios: array (3 a 6 itens)

FORMATO: responda SOMENTE em JSON válido, exatamente assim:

{
  "questoes": [
    {
      "tipo":"mcq",
      "enunciado":"...",
      "alternativas":["...","...","...","..."],
      "corretaIndex":0,
      "explicacao":"..."
    },
    {
      "tipo":"ce",
      "enunciado":"...",
      "alternativas":["Certo","Errado"],
      "corretaIndex":1,
      "explicacao":"..."
    }
  ],
  "discursivas": [
    {
      "enunciado":"...",
      "respostaModelo":"...",
      "criterios":["...","...","..."]
    }
  ]
}

DICA DE QUALIDADE:
- Distratores devem ser plausíveis e coerentes, mas errados por detalhe.
- Varie comandos ("assinale", "é correto afirmar", "considere", etc.) conforme o perfil da banca.
- Para C/E, use afirmações com nuance (exceções, termos absolutos), no estilo da banca.
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

    // Resposta da OpenAI é JSON de chat.completions
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
      // fallback offline (para não quebrar)
      const mock = buildMock({ banca: BANCA, qtd: QTD_TOTAL, dificuldade: DIFICULDADE, tema: TEMA, qtdCE: QTD_CE, qtdDiscursivas: QTD_DISC });
      return res.status(200).json({
        ok: true,
        questoes: mock.questoes,
        discursivas: mock.discursivas,
        meta: {
          banca: BANCA,
          perfilBanca: profile.id,
          dificuldade: DIFICULDADE,
          tema: TEMA,
          qtdTotal: QTD_TOTAL,
          qtdCE: QTD_CE,
          qtdDiscursivas: QTD_DISC,
          fallback: "mock_parse_fail"
        }
      });
    }

    // saneamento: separa MCQ e CE a partir do tipo
    const rawQuest = parsed.questoes.slice(0, QTD_TOTAL);

    const saneMCQ = rawQuest
      .filter(
        (q) =>
          q &&
          (q.tipo === "mcq" || (Array.isArray(q.alternativas) && q.alternativas.length >= 4)) &&
          typeof q.enunciado === "string" &&
          Array.isArray(q.alternativas) &&
          q.alternativas.length >= 4
      )
      .map((q) => ({
        tipo: "mcq",
        enunciado: String(q.enunciado).trim(),
        alternativas: q.alternativas.slice(0, 4).map((a) => String(a).trim()),
        corretaIndex: clamp(q.corretaIndex ?? 0, 0, 3),
        explicacao: String(q.explicacao || "").trim()
      }));

    const saneCE = rawQuest
      .filter(
        (q) =>
          q &&
          (q.tipo === "ce" || (Array.isArray(q.alternativas) && q.alternativas.length === 2)) &&
          typeof q.enunciado === "string"
      )
      .map((q) => {
        const corr = clamp(q.corretaIndex ?? 0, 0, 1);
        return {
          tipo: "ce",
          enunciado: String(q.enunciado).trim(),
          alternativas: ["Certo", "Errado"], // força padrão
          corretaIndex: corr,
          explicacao: String(q.explicacao || "").trim()
        };
      });

    // Garante contagens (CE exato, total exato)
    // 1) corta CE no tamanho pedido
    const ceFinal = saneCE.slice(0, QTD_CE);

    // 2) completa MCQ para bater total (QTD_TOTAL - QTD_CE)
    const mcqNeed = Math.max(0, QTD_TOTAL - ceFinal.length);
    const mcqFinal = saneMCQ.slice(0, mcqNeed);

    // 3) se ainda faltar (modelo veio curto), completa com mock
    const missing = QTD_TOTAL - (mcqFinal.length + ceFinal.length);
    let finalQuest = [...mcqFinal, ...ceFinal];

    if (missing > 0) {
      const mock = buildMock({
        banca: BANCA,
        qtd: QTD_TOTAL,
        dificuldade: DIFICULDADE,
        tema: TEMA,
        qtdCE: QTD_CE,
        qtdDiscursivas: QTD_DISC
      });

      // pega só o que falta e do tipo que está faltando
      const needCE = Math.max(0, QTD_CE - ceFinal.length);
      const needMCQ = Math.max(0, (QTD_TOTAL - QTD_CE) - mcqFinal.length);

      const addMCQ = mock.questoes.filter((x) => x.tipo === "mcq").slice(0, needMCQ);
      const addCE = mock.questoes.filter((x) => x.tipo === "ce").slice(0, needCE);

      finalQuest = [...mcqFinal, ...addMCQ, ...ceFinal, ...addCE].slice(0, QTD_TOTAL);
    }

    // Discursivas
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
        enunciado: String(d.enunciado).trim(),
        respostaModelo: String(d.respostaModelo).trim(),
        criterios: d.criterios.slice(0, 8).map((c) => String(c).trim())
      }));

    // Se discursivas vierem vazias mas foram pedidas, completa com mock
    let discFinal = saneDisc;
    if (QTD_DISC > 0 && discFinal.length < QTD_DISC) {
      const mock = buildMock({
        banca: BANCA,
        qtd: QTD_TOTAL,
        dificuldade: DIFICULDADE,
        tema: TEMA,
        qtdCE: QTD_CE,
        qtdDiscursivas: QTD_DISC
      });
      const add = mock.discursivas.slice(0, QTD_DISC - discFinal.length);
      discFinal = [...discFinal, ...add].slice(0, QTD_DISC);
    }

    // Embaralha as questões (mantém o mix)
    for (let i = finalQuest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [finalQuest[i], finalQuest[j]] = [finalQuest[j], finalQuest[i]];
    }

    return res.status(200).json({
      ok: true,
      questoes: finalQuest,
      ce: ceFinal, // opcional (diagnóstico / debug)
      discursivas: discFinal, // para UI futura
      meta: {
        banca: BANCA,
        perfilBanca: profile.id,
        dificuldade: DIFICULDADE,
        tema: TEMA,
        qtdTotal: QTD_TOTAL,
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
