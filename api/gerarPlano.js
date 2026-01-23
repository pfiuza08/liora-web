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

    // ✅ Prompt PREMIUM + anti-vago + consistência
    const system = `
Você é a IA educacional da Liora.

Tarefa:
Gerar um plano de estudos por TEMA, retornando SESSÕES completas, com blocos premium de estudo ativo.

Regras obrigatórias:
- Retorne APENAS JSON válido (sem markdown, sem texto extra).
- Não inclua crases, blocos de código ou comentários.
- O JSON deve seguir EXATAMENTE este formato:

{
  "meta": {
    "tema": "string",
    "nivel": "iniciante|intermediario|avancado"
  },
  "sessoes": [
    {
      "id": "S1",
      "titulo": "string",
      "objetivo": "string",

      "tempoEstimadoMin": 10,

      "checklist": ["string"],
      "errosComuns": ["string"],

      "flashcards": [
        { "frente": "string", "verso": "string" }
      ],

      "checkpoint": [
        {
          "tipo": "mcq",
          "pergunta": "string",
          "opcoes": ["string", "string", "string", "string"],
          "correta": 0,
          "explicacao": "string"
        },
        {
          "tipo": "curta",
          "pergunta": "string",
          "gabarito": "string"
        }
      ],

      "conteudo": {
        "introducao": "string",
        "conceitos": ["string"],
        "exemplos": ["string"],
        "aplicacoes": ["string"],
        "resumoRapido": ["string"]
      }
    }
  ]
}

Restrições de quantidade:
- Gere entre 6 e 10 sessões.
- tempoEstimadoMin: inteiro entre 10 e 35.
- checklist: 3 a 6 itens.
- errosComuns: 3 a 5 itens.
- flashcards: 3 a 6 cards por sessão.
- checkpoint: EXATAMENTE 3 itens por sessão:
  - 2 perguntas tipo "mcq"
  - 1 pergunta tipo "curta"
- mcq:
  - opcoes: exatamente 4 opções
  - correta: índice 0..3
  - explicacao: 1 a 3 frases

Qualidade obrigatória (anti-vago e pró-profundo):
- Introdução: 4 a 6 frases. Deve incluir:
  (1) o que é, (2) por que importa, (3) onde cai (prova/trabalho), (4) como estudar.
- Conceitos: 4 a 6 itens, cada item deve ter:
  "Termo — definição curta + como reconhecer na prática".
- Exemplos: 3 a 6 itens e cada exemplo deve seguir este formato:
  "Cenário: ... → Como resolver/usar: ..."
  (sem exemplo genérico).
- Aplicações: 3 a 6 itens com ação:
  "Quando X acontecer, faça Y".
- Resumo rápido: 4 a 6 itens, estilo checklist.
- checklist: coisas observáveis para dominar (não opinião).
- errosComuns: cada erro deve ter correção ("Erro: ... / Correção: ...").
- Flashcards: frente = pergunta objetiva; verso = resposta objetiva + 1 detalhe.
- Checkpoint MCQ:
  - opções devem ser diferentes entre si e plausíveis
  - correta distribuída entre 0..3 (não pode repetir sempre)
- Checkpoint curta:
  - gabarito deve ter 2 a 4 linhas, com resposta direta e justificativa.
Proibido:
- frases como "é importante", "de forma geral", "fundamental" sem explicar o porquê.


Conteúdo em português, didático, direto, sem enrolação.
`.trim();

    const user = `TEMA: ${tema}\nNÍVEL: ${nivel || "iniciante"}\nGere o plano completo e sessões completas.`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.4,
      }),
    });

    const rawText = await r.text();

    // ✅ Se OpenAI não respondeu nada
    if (!rawText || !rawText.trim()) {
      return res.status(500).json({
        error: "openai_empty_response",
        message: "OpenAI retornou resposta vazia (corpo vazio).",
        status: r.status,
      });
    }

    // ✅ Se status não OK, devolve preview
    if (!r.ok) {
      return res.status(500).json({
        error: "openai_error",
        message: "Falha no provedor de IA",
        status: r.status,
        raw: rawText.slice(0, 900),
      });
    }

    // ✅ Parse seguro do JSON da OpenAI
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({
        error: "openai_parse_error",
        message: "Não consegui interpretar a resposta da OpenAI (não é JSON).",
        raw: rawText.slice(0, 900),
      });
    }

    // ✅ Extrai texto gerado
    const outputText =
      parsed?.output_text ||
      parsed?.output?.[0]?.content?.[0]?.text ||
      "";

    if (!outputText || !outputText.trim()) {
      return res.status(500).json({
        error: "openai_no_output_text",
        message: "OpenAI respondeu, mas sem output_text.",
        debug: {
          keys: Object.keys(parsed || {}),
          output0: parsed?.output?.[0] || null,
        },
      });
    }

    // ✅ Parse do JSON gerado pela IA (com recorte)
    const data = safeJsonParse(outputText);

    if (!data?.sessoes || !Array.isArray(data.sessoes) || data.sessoes.length < 3) {
      return res.status(500).json({
        error: "invalid_ai_payload",
        message: "Resposta da IA inválida (sem sessões).",
        raw: outputText.slice(0, 900),
      });
    }

    // ✅ Normaliza sessões (mantém campos premium)
    data.sessoes = data.sessoes.map((s, i) => ({
      id: s?.id || `S${i + 1}`,
      titulo: s?.titulo || `Sessão ${i + 1}`,
      objetivo: s?.objetivo || "",

      // Premium
      tempoEstimadoMin: Number.isFinite(s?.tempoEstimadoMin) ? s.tempoEstimadoMin : 20,
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
            tipo: q?.tipo || "mcq",
            pergunta: q?.pergunta || "",
            opcoes: Array.isArray(q?.opcoes) ? q.opcoes : [],
            correta: Number.isFinite(q?.correta) ? q.correta : 0,
            explicacao: q?.explicacao || "",
            gabarito: q?.gabarito || ""
          }))
        : [],

      // Conteúdo padrão
      conteudo: {
        introducao: s?.conteudo?.introducao || "",
        conceitos: Array.isArray(s?.conteudo?.conceitos) ? s.conteudo.conceitos : [],
        exemplos: Array.isArray(s?.conteudo?.exemplos) ? s.conteudo.exemplos : [],
        aplicacoes: Array.isArray(s?.conteudo?.aplicacoes) ? s.conteudo.aplicacoes : [],
        resumoRapido: Array.isArray(s?.conteudo?.resumoRapido) ? s.conteudo.resumoRapido : []
      }
    }));

    // ✅ FIX: evita "todas corretas = A" mantendo a resposta correta
    data.sessoes = data.sessoes.map((s) => {
      const cp = Array.isArray(s.checkpoint) ? s.checkpoint : [];

      const fixed = cp.map((q) => {
        if (q?.tipo !== "mcq") return q;

        const op = Array.isArray(q?.opcoes) ? [...q.opcoes] : [];
        if (op.length !== 4) return q;

        let correta = Number.isFinite(q?.correta) ? q.correta : 0;

        // Se veio sempre A (0), desloca a correta para outra posição
        if (correta === 0) {
          const r = 1 + Math.floor(Math.random() * 3); // 1..3
          [op[0], op[r]] = [op[r], op[0]];
          correta = r;
        }

        return { ...q, opcoes: op, correta };
      });

      return { ...s, checkpoint: fixed };
    });

    // meta
    data.meta = data.meta || { tema, nivel };
    data.meta.tema = data.meta.tema || tema;
    data.meta.nivel = data.meta.nivel || nivel || "iniciante";

    return res.status(200).json(data);

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      error: "server_error",
      message: String(e?.message || e),
    });
  }
};

// -------------------------
// Helpers
// -------------------------
function safeJsonParse(raw) {
  if (!raw || typeof raw !== "string") throw new Error("JSON vazio");

  raw = raw.trim();

  // remove cercas se a IA vacilar
  raw = raw.replace(/^```json/i, "```");
  const block = raw.match(/```([\s\S]*?)```/i);
  if (block) raw = block[1].trim();

  // recorta de { até o último }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) raw = raw.slice(first, last + 1);

  if (!raw || !raw.trim()) throw new Error("JSON vazio após recorte");

  return JSON.parse(raw);
}
