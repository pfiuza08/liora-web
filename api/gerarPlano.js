module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        error: "method_not_allowed",
        message: "Use POST"
      });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { tema, nivel } = body;

    if (!tema) {
      return res.status(400).json({
        error: "bad_request",
        message: "tema é obrigatório"
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "config_error",
        message: "OPENAI_API_KEY não configurada no servidor."
      });
    }

    const nivelFinal = nivel || "iniciante";
    const clientRequestId = `liora-plano-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const system = `
Você é a IA educacional da Liora.

Sua tarefa é gerar um plano de estudos por tema com sessões completas.

Regras obrigatórias:
- Responda em português do Brasil.
- Seja didático, direto, específico e sem enrolação.
- Não use markdown.
- Preencha todos os campos do JSON.
- Não escreva frases vagas como "é importante" ou "de forma geral" sem explicar.

Regras de qualidade:
- Gere entre 6 e 10 sessões.
- Cada sessão deve ter:
  - id
  - titulo
  - objetivo
  - tempoEstimadoMin
  - checklist
  - errosComuns
  - flashcards
  - checkpoint
  - conteudo

- tempoEstimadoMin: inteiro entre 10 e 35.
- checklist: 3 a 6 itens observáveis.
- errosComuns: 3 a 5 itens, sempre com erro e correção.
- flashcards: 3 a 6 itens.
- checkpoint: exatamente 3 itens:
  - 2 do tipo "mcq"
  - 1 do tipo "curta"

Regras do checkpoint:
- Para "mcq":
  - pergunta objetiva
  - 4 opções
  - correta entre 0 e 3
  - explicacao curta
- Para "curta":
  - pergunta objetiva
  - gabarito direto com justificativa breve

Regras do conteúdo:
- introducao: 4 a 6 frases, incluindo o que é, por que importa, onde aparece e como estudar
- conceitos: 4 a 6 itens, no formato "Termo — definição curta + como reconhecer na prática"
- exemplos: 3 a 6 itens, no formato "Cenário: ... → Como resolver/usar: ..."
- aplicacoes: 3 a 6 itens, orientados à ação
- resumoRapido: 4 a 6 itens em formato checklist
`.trim();

    const user = `TEMA: ${tema}\nNÍVEL: ${nivelFinal}\nGere o plano completo.`;

    const schema = {
      name: "liora_plano_tema",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          meta: {
            type: "object",
            additionalProperties: false,
            properties: {
              tema: { type: "string" },
              nivel: {
                type: "string",
                enum: ["iniciante", "intermediario", "avancado"]
              }
            },
            required: ["tema", "nivel"]
          },
          sessoes: {
            type: "array",
            minItems: 6,
            maxItems: 10,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                titulo: { type: "string" },
                objetivo: { type: "string" },
                tempoEstimadoMin: { type: "integer" },
                checklist: {
                  type: "array",
                  items: { type: "string" }
                },
                errosComuns: {
                  type: "array",
                  items: { type: "string" }
                },
                flashcards: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      frente: { type: "string" },
                      verso: { type: "string" }
                    },
                    required: ["frente", "verso"]
                  }
                },
                checkpoint: {
                  type: "array",
                  minItems: 3,
                  maxItems: 3,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      tipo: { type: "string" },
                      pergunta: { type: "string" },
                      opcoes: {
                        type: "array",
                        items: { type: "string" }
                      },
                      correta: { type: "integer" },
                      explicacao: { type: "string" },
                      gabarito: { type: "string" }
                    },
                    required: ["tipo", "pergunta"]
                  }
                },
                conteudo: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    introducao: { type: "string" },
                    conceitos: {
                      type: "array",
                      items: { type: "string" }
                    },
                    exemplos: {
                      type: "array",
                      items: { type: "string" }
                    },
                    aplicacoes: {
                      type: "array",
                      items: { type: "string" }
                    },
                    resumoRapido: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["introducao", "conceitos", "exemplos", "aplicacoes", "resumoRapido"]
                }
              },
              required: [
                "id",
                "titulo",
                "objetivo",
                "tempoEstimadoMin",
                "checklist",
                "errosComuns",
                "flashcards",
                "checkpoint",
                "conteudo"
              ]
            }
          }
        },
        required: ["meta", "sessoes"]
      }
    };

    const openaiPayload = {
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.4,
      text: {
        format: {
          type: "json_schema",
          json_schema: schema
        }
      }
    };

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-Client-Request-Id": clientRequestId
      },
      body: JSON.stringify(openaiPayload)
    });

    const requestId = r.headers.get("x-request-id");
    const rawText = await r.text();

    if (!rawText || !rawText.trim()) {
      console.error("❌ OpenAI retornou corpo vazio", {
        clientRequestId,
        requestId,
        status: r.status
      });

      return res.status(500).json({
        error: "openai_empty_response",
        message: "OpenAI retornou resposta vazia.",
        status: r.status,
        requestId,
        clientRequestId
      });
    }

    if (!r.ok) {
      console.error("❌ OpenAI Responses API erro", {
        clientRequestId,
        requestId,
        status: r.status,
        raw: rawText
      });

      return res.status(500).json({
        error: "openai_error",
        message: "Falha no provedor de IA.",
        status: r.status,
        requestId,
        clientRequestId,
        raw: rawText.slice(0, 3000)
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("❌ Falha ao interpretar resposta HTTP da OpenAI", {
        clientRequestId,
        requestId,
        raw: rawText
      });

      return res.status(500).json({
        error: "openai_parse_error",
        message: "Não consegui interpretar a resposta HTTP da OpenAI.",
        requestId,
        clientRequestId,
        raw: rawText.slice(0, 3000)
      });
    }

    let data = extractStructuredData(parsed);

    if (!data) {
      const outputText =
        parsed?.output_text ||
        parsed?.output?.[0]?.content?.[0]?.text ||
        "";

      if (!outputText || !outputText.trim()) {
        console.error("❌ Sem conteúdo utilizável na resposta da OpenAI", {
          clientRequestId,
          requestId,
          parsedKeys: Object.keys(parsed || {})
        });

        return res.status(500).json({
          error: "openai_no_output_text",
          message: "OpenAI respondeu, mas sem conteúdo utilizável.",
          requestId,
          clientRequestId
        });
      }

      try {
        data = safeJsonParse(outputText);
      } catch (e) {
        console.error("❌ JSON final inválido vindo da IA", {
          clientRequestId,
          requestId,
          detail: String(e?.message || e),
          outputText
        });

        return res.status(500).json({
          error: "invalid_ai_json",
          message: "A IA respondeu, mas o JSON final veio inválido.",
          detail: String(e?.message || e),
          requestId,
          clientRequestId,
          raw: outputText.slice(0, 3000)
        });
      }
    }

    if (!data?.sessoes || !Array.isArray(data.sessoes) || data.sessoes.length < 3) {
      return res.status(500).json({
        error: "invalid_ai_payload",
        message: "Resposta da IA inválida (sem sessões).",
        requestId,
        clientRequestId,
        raw: JSON.stringify(data).slice(0, 3000)
      });
    }

    data.sessoes = data.sessoes.map((s, i) => {
      const checkpointOriginal = Array.isArray(s?.checkpoint) ? s.checkpoint : [];

      let checkpoint = checkpointOriginal.map((q) => {
        const tipo = q?.tipo === "curta" ? "curta" : "mcq";

        if (tipo === "curta") {
          return {
            tipo: "curta",
            pergunta: q?.pergunta || "",
            opcoes: [],
            correta: 0,
            explicacao: "",
            gabarito: q?.gabarito || ""
          };
        }

        let opcoes = Array.isArray(q?.opcoes) ? q.opcoes.filter(Boolean).slice(0, 4) : [];
        while (opcoes.length < 4) {
          opcoes.push(`Opção ${opcoes.length + 1}`);
        }

        let correta = Number.isFinite(q?.correta) ? q.correta : 0;
        if (correta < 0 || correta > 3) correta = 0;

        return {
          tipo: "mcq",
          pergunta: q?.pergunta || "",
          opcoes,
          correta,
          explicacao: q?.explicacao || "",
          gabarito: ""
        };
      });

      const mcqs = checkpoint.filter((q) => q.tipo === "mcq").slice(0, 2);
      const curtas = checkpoint.filter((q) => q.tipo === "curta").slice(0, 1);

      while (mcqs.length < 2) {
        mcqs.push({
          tipo: "mcq",
          pergunta: `Pergunta objetiva ${mcqs.length + 1}`,
          opcoes: ["Opção 1", "Opção 2", "Opção 3", "Opção 4"],
          correta: 0,
          explicacao: "Revise o conceito central desta sessão.",
          gabarito: ""
        });
      }

      while (curtas.length < 1) {
        curtas.push({
          tipo: "curta",
          pergunta: "Explique com suas palavras o ponto principal desta sessão.",
          opcoes: [],
          correta: 0,
          explicacao: "",
          gabarito: "A resposta deve apresentar a ideia central da sessão com justificativa breve."
        });
      }

      checkpoint = [mcqs[0], mcqs[1], curtas[0]];

      checkpoint = checkpoint.map((q) => {
        if (q.tipo !== "mcq") return q;

        const op = [...q.opcoes];
        let correta = q.correta;

        if (correta === 0) {
          const r = 1 + Math.floor(Math.random() * 3);
          [op[0], op[r]] = [op[r], op[0]];
          correta = r;
        }

        return { ...q, opcoes: op, correta };
      });

      return {
        id: s?.id || `S${i + 1}`,
        titulo: s?.titulo || `Sessão ${i + 1}`,
        objetivo: s?.objetivo || "",

        tempoEstimadoMin:
          Number.isFinite(s?.tempoEstimadoMin) &&
          s.tempoEstimadoMin >= 10 &&
          s.tempoEstimadoMin <= 35
            ? s.tempoEstimadoMin
            : 20,

        checklist: Array.isArray(s?.checklist) ? s.checklist.slice(0, 6) : [],
        errosComuns: Array.isArray(s?.errosComuns) ? s.errosComuns.slice(0, 5) : [],

        flashcards: Array.isArray(s?.flashcards)
          ? s.flashcards
              .map((fc) => ({
                frente: fc?.frente || "",
                verso: fc?.verso || ""
              }))
              .filter((fc) => fc.frente || fc.verso)
              .slice(0, 6)
          : [],

        checkpoint,

        conteudo: {
          introducao: s?.conteudo?.introducao || "",
          conceitos: Array.isArray(s?.conteudo?.conceitos) ? s.conteudo.conceitos.slice(0, 6) : [],
          exemplos: Array.isArray(s?.conteudo?.exemplos) ? s.conteudo.exemplos.slice(0, 6) : [],
          aplicacoes: Array.isArray(s?.conteudo?.aplicacoes) ? s.conteudo.aplicacoes.slice(0, 6) : [],
          resumoRapido: Array.isArray(s?.conteudo?.resumoRapido) ? s.conteudo.resumoRapido.slice(0, 6) : []
        }
      };
    });

    data.meta = data.meta || {};
    data.meta.tema = data.meta.tema || tema;
    data.meta.nivel = data.meta.nivel || nivelFinal;

    return res.status(200).json(data);
  } catch (e) {
    console.error("❌ server_error /api/gerarPlano", e);
    return res.status(500).json({
      error: "server_error",
      message: String(e?.message || e)
    });
  }
};

// -------------------------
// Helpers
// -------------------------

function extractStructuredData(parsed) {
  if (!parsed || typeof parsed !== "object") return null;

  if (parsed.output_parsed && typeof parsed.output_parsed === "object") {
    return parsed.output_parsed;
  }

  const output = Array.isArray(parsed.output) ? parsed.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.parsed && typeof part.parsed === "object") {
        return part.parsed;
      }
      if (typeof part?.text === "string") {
        try {
          return safeJsonParse(part.text);
        } catch {}
      }
    }
  }

  if (typeof parsed.output_text === "string") {
    try {
      return safeJsonParse(parsed.output_text);
    } catch {}
  }

  return null;
}

function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") throw new Error("JSON vazio");

  let text = raw.trim();

  text = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");

  if (first >= 0 && last > first) {
    text = text.slice(first, last + 1);
  }

  if (!text || !text.trim()) throw new Error("JSON vazio após recorte");

  return JSON.parse(text);
}
