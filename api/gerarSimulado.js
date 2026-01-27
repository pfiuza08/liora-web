// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO (SEM SDK openai)
// - Chama OpenAI via fetch direto
// - Retorna SEMPRE JSON
// - MCQ: enunciado + alternativas(4) + corretaIndex + explicacao
// - CE (Certo/Errado): enunciado + corretaIndex(0/1) + explicacao
// - Discursivas: enunciado + respostaModelo + criterios[]
//
// Compatibilidade:
// - Mantém `questoes` (MCQ) para o front atual
// - Adiciona `ce` e `discursivas` para evolução do simulados
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
        "Use assertivas objetivas (itens julgados). Foque em precisão conceitual, exceções e nuances. Pegadinhas semânticas sutis. Linguagem técnica e direta. Evite humor. Distratores não se aplicam em CE, mas as assertivas devem ser plausíveis."
    };
  }
  if (b.includes("FCC")) {
    return {
      id: "FCC",
      nome: "FCC",
      estilo:
        "Enunciado descritivo moderado, cobra definição + aplicação. Alternativas plausíveis com termos próximos. Linguagem formal."
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
      "Alternativas muito plausíveis e próximas, cobra interpretação e aplicação. Pegadinhas sutis (absolutos, exceções, nuances). Enunciado direto, mas exige atenção."
  };
}

// Blueprint padrão de mistura (se o front não mandar qtdCE/qtdDiscursivas)
function mixBlueprint(profileId, qtdTotal) {
  const Q = clamp(qtdTotal ?? 5, 3, 30);

  // default: bem conservador
  let mcq = Q;
  let ce = 0;

  if (profileId === "CEBRASPE") {
    // CEBRASPE é CE "by design"
    ce = Math.max(2, Math.round(Q * 0.75));
    mcq = Q - ce;
    if (mcq < 0) mcq = 0;
  } else {
    // outras bancas: pitada de CE (treino de precisão)
    ce = Math.min(6, Math.round(Q * 0.2));
    mcq = Q - ce;
  }

  return { mcq, ce };
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
      // opcionais:
      qtdCE,
      qtdDiscursivas
    } = req.body || {};

    const QTD_TOTAL = clamp(qtd ?? 5, 3, 30);

    const BANCA = String(banca || "FGV");
    const DIFICULDADE = String(dificuldade || "misturado");
    const TEMA = String(tema || "").trim();

    const profile = bancaProfile(BANCA);

    // Definição de mix:
    // - Se o front mandar qtdCE, respeita.
    // - Se não mandar, usa blueprint por banca.
    const blueprint = mixBlueprint(profile.id, QTD_TOTAL);

    const QTD_CE = typeof qtdCE === "number"
      ? clamp(qtdCE, 0, QTD_TOTAL)
      : clamp(qtdCE ?? blueprint.ce, 0, QTD_TOTAL);

    const QTD_MCQ = clamp(QTD_TOTAL - QTD_CE, 0, QTD_TOTAL);

    // Discursivas fora da conta principal (bônus). Se não mandar, default 0.
    const QTD_DISC = clamp(qtdDiscursivas ?? 0, 0, 10);

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

SAÍDA:
- Gere exatamente ${QTD_MCQ} questões de MÚLTIPLA ESCOLHA (MCQ), com 4 alternativas.
- Gere exatamente ${QTD_CE} questões de CERTO/ERRADO (CE).
- Gere exatamente ${QTD_DISC} questões DISCURSIVAS (se QTD_DISC=0, retorne array vazio).

REGRAS IMPORTANTES:
- NÃO use markdown.
- NÃO inclua letras A/B/C/D nas alternativas (o front faz isso).
- Evite emojis.
- Sempre retorne explicação objetiva (1 a 2 frases).

SCHEMAS:

MCQ:
{
  "enunciado": "string",
  "alternativas": ["string","string","string","string"],
  "corretaIndex": 0..3,
  "explicacao": "string"
}

CE (certo/errado):
- alternativas DEVEM ser exatamente ["Certo","Errado"]
- corretaIndex: 0 para Certo, 1 para Errado

{
  "enunciado": "string (uma assertiva julgável)",
  "alternativas": ["Certo","Errado"],
  "corretaIndex": 0..1,
  "explicacao": "string"
}

Discursiva:
{
  "enunciado": "string",
  "respostaModelo": "string curta (4 a 8 linhas no máximo)",
  "criterios": ["string","string","string"]
}

FORMATO: responda SOMENTE em JSON válido, exatamente assim:

{
  "questoes": [ ...MCQ... ],
  "ce": [ ...CE... ],
  "discursivas": [ ...Discursivas... ]
}

DICA DE QUALIDADE:
- MCQ: distratores plausíveis e errados por detalhe.
- CE: assertivas curtas, com nuances e exceções quando adequado ao perfil.
- Varie comandos ("assinale", "é correto afirmar", "considere") no MCQ quando fizer sentido ao perfil.
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

    // -------------------------
    // SANITIZA MCQ
    // -------------------------
    const saneMCQ = parsed.questoes
      .filter(
        (q) =>
          q &&
          typeof q.enunciado === "string" &&
          Array.isArray(q.alternativas) &&
          q.alternativas.length >= 4
      )
      .slice(0, QTD_MCQ)
      .map((q) => ({
        enunciado: String(q.enunciado).trim(),
        alternativas: q.alternativas.slice(0, 4).map((a) => String(a).trim()),
        corretaIndex: clamp(q.corretaIndex ?? 0, 0, 3),
        explicacao: String(q.explicacao || "").trim()
      }));

    // -------------------------
    // SANITIZA CE
    // -------------------------
    const parsedCE = Array.isArray(parsed.ce) ? parsed.ce : [];
    const saneCE = parsedCE
      .filter((c) => c && typeof c.enunciado === "string")
      .slice(0, QTD_CE)
      .map((c) => ({
        enunciado: String(c.enunciado).trim(),
        alternativas: ["Certo", "Errado"],
        corretaIndex: clamp(c.corretaIndex ?? 0, 0, 1),
        explicacao: String(c.explicacao || "").trim()
      }));

    // -------------------------
    // SANITIZA DISC
    // -------------------------
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

    // Se MCQ veio vazio mas CE veio ok, ainda é útil (especialmente CEBRASPE).
    // Mas para não quebrar front atual (que espera questoes), garantimos ao menos 1 MCQ.
    if (!saneMCQ.length) {
      // fallback mínimo: cria 1 MCQ simples a partir do tema
      const temaFallback = TEMA || "conceitos gerais";
      return res.status(200).json({
        ok: true,
        questoes: [
          {
            enunciado: `(${profile.nome}) Sobre ${temaFallback}, assinale a alternativa correta.`,
            alternativas: [
              "Afirmação genérica correta.",
              "Afirmação plausível, mas incorreta por detalhe.",
              "Afirmação incorreta.",
              "Afirmação incorreta."
            ],
            corretaIndex: 0,
            explicacao: "A alternativa correta é a que mantém a definição/condição exata sem exceções indevidas."
          }
        ],
        ce: saneCE,
        discursivas: saneDisc,
        meta: {
          banca: BANCA,
          perfilBanca: profile.id,
          dificuldade: DIFICULDADE,
          tema: TEMA,
          qtdTotal: QTD_TOTAL,
          qtdMCQ: 1,
          qtdCE: saneCE.length,
          qtdDiscursivas: saneDisc.length,
          note: "Fallback: MCQ mínimo gerado pois o modelo não retornou MCQ válido."
        }
      });
    }

    return res.status(200).json({
      ok: true,
      questoes: saneMCQ,      // ✅ compatível com front atual
      ce: saneCE,             // ✅ novo
      discursivas: saneDisc,  // ✅ novo (para UI futura)
      meta: {
        banca: BANCA,
        perfilBanca: profile.id,
        dificuldade: DIFICULDADE,
        tema: TEMA,
        qtdTotal: QTD_TOTAL,
        qtdMCQ: saneMCQ.length,
        qtdCE: saneCE.length,
        qtdDiscursivas: saneDisc.length
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
