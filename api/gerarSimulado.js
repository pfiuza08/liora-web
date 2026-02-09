// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO (SEM SDK openai)
// - OpenAI via fetch direto
// - Retorna SEMPRE JSON
//
// MODOS:
// - mode="obj"  -> questoes (mcq + ce), discursivas opcional (geralmente vazio)
// - mode="disc" -> questoes (somente discursivas) + discursivas (espelho)
//
// TIPOS:
// - MCQ : tipo="mcq" | alternativas(4) | corretaIndex 0..3 | explicacao
// - CE  : tipo="ce"  | alternativas(2) | corretaIndex 0..1 | explicacao
// - DISC: tipo="disc" | sem alternativas | respostaModelo | criterios[]
//
// ✅ Upgrade v1 (Raciocínio Lógico caprichado):
// - Regras formais anti “senso comum”
// - Blueprint de diversidade
// - Validador + retries (até 3) quando for RL
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
  let i = 0;
  let j = 0;
  while (i < mcq.length || j < ce.length) {
    if (i < mcq.length) out.push(mcq[i++]);
    if (j < ce.length) out.push(ce[j++]);
  }
  return out;
}

// coloca discursivas em posições “humanas” (no meio/final)
function insertDisc(questoes, disc) {
  if (!disc.length) return questoes;

  const out = [...questoes];
  for (let k = 0; k < disc.length; k++) {
    const base = Math.floor(out.length * 0.7);
    const span = Math.max(1, out.length - base + 1);
    const pos = clamp(base + Math.floor(Math.random() * span), 0, out.length);
    out.splice(pos, 0, disc[k]);
  }
  return out;
}

/* =========================================================
   ✅ Validador (Raciocínio Lógico)
   - Bloqueia “senso comum”
   - Exige pista formal nas explicações
   - Anti-repetição simples
   ========================================================= */
function hasCommonSenseLanguage(s) {
  const t = String(s || "").toLowerCase();
  return /(na vida real|no mundo real|normalmente|geralmente|senso comum|obviamente|todo mundo sabe|é claro que|porque sim)/i.test(
    t
  );
}

function hasFormalCue(s) {
  const t = String(s || "");
  return /(de morgan|contrapositiv|tabela[-\s]?verdade|modus\s*ponens|modus\s*tollens|equival[eê]ncia|tautologi|contradi[cç][aã]o|conting[eê]ncia|nega[cç][aã]o|quantificador|venn|inclus[aã]o[-\s]?exclus[aã]o|silogismo|implica[cç][aã]o|bicondicional|consequ[eê]ncia l[oó]gica)/i.test(
    t
  );
}

function validateLogicPack(parsed) {
  const mcq = Array.isArray(parsed?.mcq) ? parsed.mcq : [];
  const ce = Array.isArray(parsed?.ce) ? parsed.ce : [];
  const all = [...mcq, ...ce];

  // 1) proíbe “senso comum” no enunciado/explicação
  for (const q of all) {
    if (hasCommonSenseLanguage(q?.explicacao) || hasCommonSenseLanguage(q?.enunciado)) {
      return { ok: false, reason: "common_sense" };
    }
  }

  // 2) exige explicação com “pista formal” (ou sequência/padrão com regra clara)
  for (const q of all) {
    const exp = String(q?.explicacao || "");
    const enu = String(q?.enunciado || "");

    const looksLikeSequence =
      /(sequ[eê]ncia|padr[aã]o|altern[aâ]ncia|progress[aã]o|termo seguinte|complete)/i.test(enu);

    const okFormal =
      hasFormalCue(exp) ||
      looksLikeSequence ||
      /regra|dedu[cç][aã]o|an[aá]lise|pela defini[cç][aã]o|logo|portanto/i.test(exp);

    if (!okFormal) return { ok: false, reason: "no_formal_cue" };
  }

  // 3) anti-repetição simples: evita 3 enunciados começando igual
  const starters = all.map((q) => String(q?.enunciado || "").trim().slice(0, 22).toLowerCase());
  let streak = 1;
  for (let i = 1; i < starters.length; i++) {
    if (starters[i] && starters[i] === starters[i - 1]) streak++;
    else streak = 1;
    if (streak >= 3) return { ok: false, reason: "too_repetitive" };
  }

  return { ok: true };
}

/* =========================================================
   OpenAI (fetch direto)
   ========================================================= */
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
      max_tokens: 2600,
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
    throw new Error(
      `OpenAI erro HTTP ${resp.status}: ${errJson?.error?.message || rawText.slice(0, 300)}`
    );
  }

  const data = JSON.parse(rawText);
  const content = data?.choices?.[0]?.message?.content || "";

  let parsed = null;
  try {
    const trimmed = String(content).trim();
    if (trimmed.startsWith("{")) parsed = JSON.parse(trimmed);
  } catch {}
  if (!parsed) parsed = extractJsonObject(content);

  if (!parsed) {
    throw new Error(`Modelo não retornou JSON válido. preview=${String(content).slice(0, 220)}`);
  }

  return parsed;
}

/* =========================================================
   ✅ Retry com validação (para RL)
   ========================================================= */
async function callWithRetries({ apiKey, buildPrompt, validate, tries = 3 }) {
  let last = null;
  for (let i = 1; i <= tries; i++) {
    const prompt = buildPrompt(i);
    const parsed = await callOpenAI({ apiKey, prompt });
    last = parsed;

    const verdict = validate ? validate(parsed) : { ok: true };
    if (verdict.ok) return parsed;

    console.warn(`⚠️ gerarSimulado retry ${i}/${tries} por validação: ${verdict.reason}`);
  }
  return last;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Use POST" });
    }

    const body = req.body || {};
    const MODE = String(body.mode || "obj").toLowerCase(); // "obj" | "disc"

    const BANCA = String(body.banca || "FGV");
    const DIFICULDADE = String(body.dificuldade || "misturado");
    const TEMA = String(body.tema || "").trim();

    const profile = bancaProfile(BANCA);

    // ✅ detector: ativa “modo RL caprichado”
    const isRaciocinioLogico =
      /racioc[ií]nio\s*l[oó]gico|l[oó]gica\s*(proposicional|formal)?|proposi[cç][aã]o|tabela[-\s]?verdade|de\s*morgan|contrapositiva|quantificador|conjuntos|venn|silogismo/i.test(
        `${TEMA} ${body.area || ""}`
      );

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "OPENAI_API_KEY ausente no ambiente" });
    }

    // ======================================================
    // MODO DISC: somente discursivas
    // Observação: usa qtdDiscursivas, mas aceita qtd como fallback
    // ======================================================
    if (MODE === "disc") {
      const QTD_DISC = clamp(body.qtdDiscursivas ?? body.qtd ?? 3, 1, 20);

      const prompt = `
Você é um gerador de questões DISCURSIVAS com estilo de banca.

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
- Discursivas devem ter enunciado claro, resposta modelo e critérios.

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

DICAS DE QUALIDADE:
- Comando bem definido (explique, fundamente, analise, compare).
- Resposta modelo objetiva e comparável.
- Critérios curtos e avaliáveis.
`.trim();

      const parsed = await callOpenAI({ apiKey, prompt });

      const arrDISC = Array.isArray(parsed.disc) ? parsed.disc : [];

      // saneamento: garante enunciado e evita itens vazios
      const saneDISC = arrDISC
        .filter((d) => d && typeof d.enunciado === "string" && String(d.enunciado).trim().length >= 8)
        .slice(0, QTD_DISC)
        .map((d) => ({
          tipo: "disc",
          enunciado: String(d.enunciado || "").trim(),
          alternativas: [],
          corretaIndex: null,
          explicacao: "",
          respostaModelo: String(d.respostaModelo || "").trim(),
          criterios: Array.isArray(d.criterios)
            ? d.criterios.map((c) => String(c).trim()).filter(Boolean).slice(0, 8)
            : []
        }));

      if (saneDISC.length < Math.min(1, QTD_DISC)) {
        return res.status(200).json({
          ok: false,
          error: "Discursivas insuficientes após validação"
        });
      }

      // front usa um único array
      return res.status(200).json({
        ok: true,
        questoes: saneDISC,
        discursivas: saneDISC,
        meta: {
          mode: "disc",
          banca: BANCA,
          perfilBanca: profile.id,
          dificuldade: DIFICULDADE,
          tema: TEMA,
          qtdTotal: saneDISC.length,
          qtdDiscursivas: saneDISC.length
        }
      });
    }

    // ======================================================
    // MODO OBJ: MCQ + CE (disc opcional, mas default 0)
    // ======================================================
    const QTD_TOTAL = clamp(body.qtd ?? 5, 3, 30);

    // regra: preserve pelo menos 3 MCQ
    const CE_RAW = clamp(body.qtdCE ?? 0, 0, 30);

    const QTD_CE = Math.min(CE_RAW, Math.max(0, QTD_TOTAL - 3));
    const QTD_MCQ = Math.max(3, QTD_TOTAL - QTD_CE);

    const buildPrompt = (attempt = 1) => {
      const RL_RULES = `
REGRAS ESPECÍFICAS PARA RACIOCÍNIO LÓGICO (OBRIGATÓRIAS):
- Proibido justificar por senso comum, "mundo real", opiniões ou plausibilidade cotidiana.
- Proposição é objeto formal: não atribua V/F a frases do cotidiano sem valoração/definição.
- Questões C/E e MCQ devem ser decidíveis por lógica formal (regras, equivalências, tabela-verdade, inferência, quantificadores, conjuntos, dedução).
- Explicação deve citar pelo menos 1 regra/ideia formal (ex.: De Morgan, contrapositiva, modus ponens/tollens, equivalência, quantificadores, Venn, inclusão-exclusão, padrão/alternância).
- Variedade obrigatória: misture tópicos no pacote e evite repetir o mesmo “molde” em sequência.
- Evite enunciados vagos (ex.: "Maria é inteligente"). Prefira P,Q,R (variáveis proposicionais) ou contexto fechado.
`.trim();

      const RL_BLUEPRINT = `
DISTRIBUIÇÃO (guia de diversidade):
- 2 questões: proposicional (negação, equivalências, implicação/bicondicional)
- 1 questão: validade de argumento (modus ponens/tollens, contrapositiva)
- 1 questão: quantificadores (negar "todo"/"existe") OU conjuntos (Venn / inclusão-exclusão)
- 1 questão: dedução/ordenação com restrições OU sequência/padrão
`.trim();

      return `
Você é um gerador de questões de simulado com estilo de banca.

BANCA: ${profile.nome}
PERFIL DA BANCA (aplique rigorosamente):
${profile.estilo}

DIFICULDADE: ${DIFICULDADE}
TEMA: ${TEMA ? `"${TEMA}"` : "Livre (tema geral da área)"}

${isRaciocinioLogico ? RL_RULES : ""}

${isRaciocinioLogico ? RL_BLUEPRINT : ""}

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

DICAS DE QUALIDADE:
- Distratores plausíveis, errados por 1 detalhe.
- Varie comandos (assinale, considere, é correto afirmar, etc).
- Para C/E, use assertivas com nuance (não óbvias).
- Explicação: 2–4 frases, formal e auditável.
- Tentativa atual: ${attempt} (se tentativa > 1, aumente rigor e diversidade).
`.trim();
    };

    const parsed = await callWithRetries({
      apiKey,
      buildPrompt,
      validate: isRaciocinioLogico ? validateLogicPack : null,
      tries: isRaciocinioLogico ? 3 : 1
    });

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
      .filter((q) => q && typeof q.enunciado === "string")
      .slice(0, QTD_CE)
      .map((q) => ({
        tipo: "ce",
        enunciado: String(q.enunciado).trim(),
        alternativas: ["Certo", "Errado"],
        corretaIndex: clamp(q.corretaIndex ?? 0, 0, 1),
        explicacao: String(q.explicacao || "").trim()
      }));

    if (saneMCQ.length < 3) {
      return res.status(200).json({
        ok: false,
        error: "MCQ insuficientes após validação"
      });
    }

    let questoes = interleave(saneMCQ, saneCE);
    questoes = questoes.slice(0, QTD_TOTAL);

    return res.status(200).json({
      ok: true,
      questoes,
      discursivas: [], // modo obj não traz disc
      meta: {
        mode: "obj",
        banca: BANCA,
        perfilBanca: profile.id,
        dificuldade: DIFICULDADE,
        tema: TEMA,
        isRaciocinioLogico,
        qtdTotal: QTD_TOTAL,
        qtdMCQ: QTD_MCQ,
        qtdCE: QTD_CE,
        qtdDiscursivas: 0
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
