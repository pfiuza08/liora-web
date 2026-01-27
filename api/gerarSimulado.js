// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO (SEM SDK openai)
// - Chama OpenAI via fetch direto
// - Retorna SEMPRE JSON
// - MCQ: enunciado + alternativas(4) + corretaIndex + explicacao
// - Discursivas (opcional): enunciado + respostaModelo + criterios[]
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

  // Normaliza nomes comuns
  if (b.includes("CEBRASPE") || b.includes("CESPE")) {
    return {
      id: "CEBRASPE",
      nome: "CESPE/CEBRASPE",
      estilo:
        "Enunciados com assertivas, foco em precisão conceitual, pegadinhas semânticas e exceções. Linguagem técnica e direta. Evite humor. Alternativas plausíveis e próximas."
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

  // default FGV
  return {
    id: "FGV",
    nome: "FGV",
    estilo:
      "Alternativas muito plausíveis e próximas, cobra interpretação e aplicação. Pegadinhas sutis (termos absolutos, exceções, nuances). Enunciado direto, mas exige atenção."
  };
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
      // ✅ novo (opcional): número de discursivas
      qtdDiscursivas
    } = req.body || {};

    const QTD = clamp(qtd ?? 5, 3, 30);
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

    // Observação: o front atual espera `questoes`.
    // Vamos manter `questoes` como MCQ e adicionar `discursivas` sem quebrar nada.

    const prompt = `
Você é um gerador de questões de simulado com estilo de banca.

BANCA: ${profile.nome}
PERFIL DA BANCA (aplique rigorosamente):
${profile.estilo}

DIFICULDADE: ${DIFICULDADE}
TEMA: ${TEMA ? `"${TEMA}"` : "Livre (tema geral da área)"}

SAÍDA:
- Gere exatamente ${QTD} questões de MÚLTIPLA ESCOLHA (MCQ), 4 alternativas.
- Gere exatamente ${QTD_DISC} questões DISCURSIVAS (se QTD_DISC=0, retorne array vazio).

REGRAS IMPORTANTES:
- NÃO use markdown.
- NÃO inclua letras A/B/C/D nas alternativas (o front faz isso).
- Evite emojis.
- Cada questão MCQ deve ter:
  - enunciado: string (curto e claro)
  - alternativas: array de 4 strings
  - corretaIndex: inteiro 0..3
  - explicacao: 1 a 2 frases explicando por que é a correta (objetivo, sem floreio)
- Cada questão discursiva deve ter:
  - enunciado: string (pergunta)
  - respostaModelo: string curta (4 a 8 linhas no máximo)
  - criterios: array com 3 a 6 itens curtos (o que avaliar)

FORMATO: responda SOMENTE em JSON válido, exatamente assim:

{
  "questoes": [
    {
      "enunciado": "...",
      "alternativas": ["...", "...", "...", "..."],
      "corretaIndex": 0,
      "explicacao": "..."
    }
  ],
  "discursivas": [
    {
      "enunciado": "...",
      "respostaModelo": "...",
      "criterios": ["...", "..."]
    }
  ]
}

DICA DE QUALIDADE:
- Distratores devem ser plausíveis e coerentes com o tema, mas incorretos por um detalhe.
- Varie comandos ("assinale", "é correto afirmar", "considere", etc.) conforme o perfil da banca.
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
        max_tokens: 2000,
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

    const saneMCQ = parsed.questoes
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

    // Discursivas: opcional, não quebra front
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

    if (!saneMCQ.length) {
      return res.status(200).json({
        ok: false,
        error: "Questões inválidas após validação",
        rawPreview: String(content).slice(0, 300)
      });
    }

    return res.status(200).json({
      ok: true,
      questoes: saneMCQ, // ✅ mantém compatível com o front atual
      discursivas: saneDisc, // ✅ novo (para UI futura)
      meta: {
        banca: BANCA,
        perfilBanca: profile.id,
        dificuldade: DIFICULDADE,
        tema: TEMA,
        qtd: QTD,
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
