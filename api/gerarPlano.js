module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "method_not_allowed", message: "Use POST" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { tema, nivel } = body;

    if (!tema) {
      return res.status(400).json({ error: "bad_request", message: "tema é obrigatório" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "config_error",
        message: "OPENAI_API_KEY não configurada no servidor."
      });
    }

    const nivelFinal = nivel || "iniciante";

    const system = `
Você é a IA educacional da Liora.

Tarefa:
Gerar um plano de estudos por TEMA, retornando SESSÕES completas, com blocos premium de estudo ativo.

Regras obrigatórias:
- Retorne conteúdo integralmente em português do Brasil.
- Seja didático, direto, específico e sem enrolação.
- Não use markdown, não use crases, não use comentários.
- Preencha todos os campos do JSON com conteúdo consistente.
- Não escreva frases vagas como "é importante", "de forma geral" ou "fundamental" sem explicar o porquê.

Regras de qualidade:
- Gere entre 6 e 10 sessões.
- tempoEstimadoMin: inteiro entre 10 e 35.
- checklist: 3 a 6 itens observáveis.
- errosComuns: 3 a 5 itens, sempre no formato "Erro: ... / Correção: ...".
- flashcards: 3 a 6 cards por sessão.
- checkpoint: exatamente 3 itens por sessão:
  - 2 perguntas tipo "mcq"
  - 1 pergunta tipo "curta"
- mcq:
  - exatamente 4 opções
  - correta: índice entre 0 e 3
  - explicacao: 1 a 3 frases
  - distribua a alternativa correta, evitando concentrar tudo em 0
- introducao:
  - 4 a 6 frases
  - incluir: o que é, por que importa, onde aparece, como estudar
- conceitos:
  - 4 a 6 itens
  - cada item no formato "Termo — definição curta + como reconhecer na prática"
- exemplos:
  - 3 a 6 itens
  - cada item no formato "Cenário: ... → Como resolver/usar: ..."
- aplicacoes:
  - 3 a 6 itens orientados à ação
  - no formato "Quando X acontecer, faça Y"
- resumoRapido:
  - 4 a 6 itens em estilo checklist
- checkpoint curta:
  - gabarito com resposta direta e justificativa breve
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
                      tipo: {
                        type: "string",
                        enum: ["mcq", "curta"]
                      },
                      pergunta: { type: "string" },
                      opcoes: {
                        type: "array",
                        items: { type: "string" }
                      },
                      correta: { type: "integer" },
                      explicacao: { type: "string" },
                      gabarito: { type: "string" }
                    },
                    required: ["tipo", "pergunta", "opcoes", "correta", "explicacao", "gabarito"]
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
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(openaiPayload)
    });

    const rawText = await r.text();

    if (!rawText || !rawText.trim()) {
      return res.status(500).json({
        error: "openai_empty_response",
        message: "OpenAI retornou resposta vazia.",
        status: r.status
      });
    }

    if (!r.ok) {
      return res.status(500).json({
        error: "openai_error",
        message: "Falha no provedor de IA.",
        status: r.status,
        raw: rawText.slice(0, 1500)
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return res.status(500).json({
        error: "openai_parse_error",
        message: "Não consegui interpretar a resposta HTTP da OpenAI.",
        raw: rawText.slice(0, 1500)
      });
    }

    let data = extractStructuredData(parsed);

    if (!data) {
      const outputText =
        parsed?.output_text ||
        parsed?.output?.[0]?.content?.[0]?.text ||
        "";

      if (!outputText || !outputText.trim()) {
        return res.status(500).json({
          error: "openai_no_output_text",
          message: "OpenAI respondeu, mas sem conteúdo utilizável.",
          debug: {
            keys: Object.keys(parsed || {}),
            output0: parsed?.output?.[0] || null
          }
        });
      }

      try {
        data = safeJsonParse(outputText);
      } catch (e) {
        return res.status(500).json({
          error: "invalid_ai_json",
          message: "A IA respondeu, mas o JSON final veio inválido.",
          detail: String(e?.message || e),
          raw: outputText.slice(0, 1500)
        });
      }
    }

    if (!data?.sessoes || !Array.isArray(data.sessoes) || data.sessoes.length < 3) {
      return res.status(500).json({
        error: "invalid_ai_payload",
        message: "Resposta da IA inválida (sem sessões).",
        raw: JSON.stringify(data).slice(0, 1500)
      });
    }

    data.sessoes = data.sessoes.map((s, i) => ({
      id: s?.id || `S${i + 1}`,
      titulo: s?.titulo || `Sessão ${i + 1}`,
      objetivo: s?.objetivo || "",

      tempoEstimadoMin:
        Number.isFinite(s?.tempoEstimadoMin) && s.tempoEstimadoMin >= 10 && s.tempoEstimadoMin <= 35
          ? s.tempoEstimadoMin
          : 20,

      checklist: Array.isArray(s?.checklist) ? s.checklist : [],
      errosComuns: Array.isArray(s?.errosComuns) ? s.errosComuns : [],

      flashcards: Array.isArray(s?.flashcards)
        ? s.flashcards
            .map((fc) => ({
              frente: fc?.frente || "",
              verso: fc?.verso || ""
            }))
            .filter((fc) => fc.frente || fc.verso)
        : [],

      checkpoint: Array.isArray(s?.checkpoint)
        ? s.checkpoint.map((q) => ({
            tipo: q?.tipo === "curta" ? "curta" : "mcq",
            pergunta: q?.pergunta || "",
            opcoes: Array.isArray(q?.opcoes) ? q.opcoes : [],
            correta: Number.isFinite(q?.correta) ? q.correta : 0,
            explicacao: q?.explicacao || "",
            gabarito: q?.gabarito || ""
          }))
        : [],

      conteudo: {
        introducao: s?.conteudo?.introducao || "",
        conceitos: Array.isArray(s?.conteudo?.conceitos) ? s.conteudo.conceitos : [],
        exemplos: Array.isArray(s?.conteudo?.exemplos) ? s.conteudo.exemplos : [],
        aplicacoes: Array.isArray(s?.conteudo?.aplicacoes) ? s.conteudo.aplicacoes : [],
        resumoRapido: Array.isArray(s?.conteudo?.resumoRapido) ? s.conteudo.resumoRapido : []
      }
    }));

    data.sessoes = data.sessoes.map((s) => {
      const cp = Array.isArray(s.checkpoint) ? s.checkpoint : [];

      const fixed = cp.map((q) => {
        if (q?.tipo !== "mcq") return q;

        const op = Array.isArray(q?.opcoes) ? [...q.opcoes] : [];
        if (op.length !== 4) return q;

        let correta = Number.isFinite(q?.correta) ? q.correta : 0;

        if (correta < 0 || correta > 3) correta = 0;

        if (correta === 0) {
          const r = 1 + Math.floor(Math.random() * 3);
          [op[0], op[r]] = [op[r], op[0]];
          correta = r;
        }

        return { ...q, opcoes: op, correta };
      });

      return { ...s, checkpoint: fixed };
    });

    data.meta = data.meta || {};
    data.meta.tema = data.meta.tema || tema;
    data.meta.nivel = data.meta.nivel || nivelFinal;

    return res.status(200).json(data);
  } catch (e) {
    console.error(e);
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
