// /api/gerarSimulado.js
// ==========================================================
// LIORA — API GERAR SIMULADO (SEM SDK openai) — v3.0
// - Mistura MCQ (4 alts) + CE (Certo/Errado) dentro de `questoes`
// - Discursivas retornam em `discursivas` (para UI futura)
// - Perfil de banca com checklist real
// - Validação + "repair pass" para completar quantidades
// ==========================================================

function clamp(n, min, max) {
  const x = Number(n);
  if (Number.isNaN(x)) return min;
  return Math.max(min, Math.min(max, x));
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Extrai o primeiro JSON {} válido mesmo com lixo antes/depois
function extractJsonObject(text) {
  if (!text) return null;
  const s = String(text);

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = s.slice(start, end + 1);
  return safeJsonParse(candidate);
}

function normalizeText(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”‘’"]/g, '"');
}

function isTooShort(s, minLen = 6) {
  return normalizeText(s).length < minLen;
}

function hasDuplicateAlternatives(alts) {
  const norm = (alts || []).map(normalizeText).filter(Boolean);
  const set = new Set(norm);
  return set.size !== norm.length;
}

// Heurística simples para evitar alternativas "iguais demais"
function lowVarietyAlternatives(alts) {
  const norm = (alts || []).map(normalizeText).filter(Boolean);
  if (norm.length < 2) return true;

  // se muitas alternativas compartilham quase o mesmo começo, suspeito
  const prefixes = norm.map((x) => x.slice(0, 18));
  const set = new Set(prefixes);
  return set.size <= Math.max(1, Math.floor(norm.length / 2));
}

// Perfil de banca (com regras acionáveis)
function bancaProfile(bancaRaw) {
  const b = String(bancaRaw || "").toUpperCase();

  if (b.includes("CEBRASPE") || b.includes("CESPE")) {
    return {
      id: "CEBRASPE",
      nome: "CESPE/CEBRASPE",
      checklist: [
        "Preferir assertivas e julgamentos; foco em precisão conceitual.",
        "Pegadinhas por exceções/condições (salvo, exceto, desde que).",
        "CE deve soar plausível e técnico, sem humor.",
        "Explicação aponta o detalhe que torna certo/errado."
      ],
      comandos: ["Julgue o item", "Considere as assertivas", "Assinale Certo ou Errado"]
    };
  }

  if (b.includes("FCC")) {
    return {
      id: "FCC",
      nome: "FCC",
      checklist: [
        "Equilíbrio entre definição e aplicação.",
        "Distratores com termos próximos (diferenças conceituais sutis).",
        "Linguagem formal, enunciado um pouco mais descritivo."
      ],
      comandos: ["Assinale a alternativa correta", "É correto afirmar", "Considere"]
    };
  }

  if (b.includes("VUNESP")) {
    return {
      id: "VUNESP",
      nome: "VUNESP",
      checklist: [
        "Comandos claros e objetivos.",
        "Alternativas mais separadas (menos armadilhas semânticas).",
        "Contexto prático quando útil."
      ],
      comandos: ["Assinale a alternativa correta", "Indique", "Considere"]
    };
  }

  if (b.includes("IBFC")) {
    return {
      id: "IBFC",
      nome: "IBFC",
      checklist: [
        "Direta e literal.",
        "Foco em conceitos/procedimentos.",
        "Alternativas curtas e sem enrolação."
      ],
      comandos: ["Assinale", "Indique", "É correto"]
    };
  }

  if (b.includes("AOCP")) {
    return {
      id: "AOCP",
      nome: "AOCP",
      checklist: [
        "Intermediária: clara, cobra aplicação.",
        "Distratores plausíveis.",
        "Evitar textos longos."
      ],
      comandos: ["Assinale a alternativa correta", "Considere", "É correto afirmar"]
    };
  }

  // default: FGV
  return {
    id: "FGV",
    nome: "FGV",
    checklist: [
      "Distratores muito plausíveis e próximos.",
      "Pegadinhas sutis (termos absolutos, exceções, 'em regra', 'necessariamente').",
      "Mais interpretação e aplicação; cenários curtos são bem-vindos.",
      "Explicação direta: por que correta e por que as outras falham (sem listar todas)."
    ],
    comandos: ["Assinale a alternativa correta", "É correto afirmar", "Considere"]
  };
}

// Distribuição padrão (qtd = TOTAL do simulado)
function computeMixCounts(qtdTotal, qtdCE_raw, qtdDisc_raw, profileId) {
  const Q = clamp(qtdTotal ?? 5, 3, 30);

  // defaults
  let disc = clamp(qtdDisc_raw ?? 0, 0, 10);
  let ce;

  // Se o usuário mandou qtdCE, respeita
  if (typeof qtdCE_raw !== "undefined" && qtdCE_raw !== null && qtdCE_raw !== "") {
    ce = clamp(qtdCE_raw, 0, Q);
  } else {
    // padrão por banca
    // CEBRASPE geralmente combina MUITO com CE
    if (profileId === "CEBRASPE") ce = Math.round(Q * 0.45);
    else ce = Math.round(Q * 0.30);
  }

  // Ajuste para não exceder
  if (disc > Q) disc = Q;
  if (ce > Q - disc) ce = Math.max(0, Q - disc);

  const mcq = Math.max(0, Q - ce - disc);

  // garante pelo menos 1 MCQ na maioria dos casos (exceto se o usuário explicitou)
  const userForced = typeof qtdCE_raw !== "undefined" || typeof qtdDisc_raw !== "undefined";
  if (!userForced && mcq === 0 && Q > 0) {
    // tira 1 de CE se possível
    if (ce > 0) return { total: Q, mcq: 1, ce: ce - 1, disc };
  }

  return { total: Q, mcq, ce, disc };
}

function buildPrompt({ profile, dificuldade, tema, qtdMCQ, qtdCE, qtdDisc }) {
  const temaStr = tema ? `"${tema}"` : "Livre (tema geral da área)";

  const checklist = profile.checklist.map((x) => `- ${x}`).join("\n");
  const comandos = profile.comandos.map((x) => `- ${x}`).join("\n");

  return `
Você é um gerador de questões de simulado com estilo de banca.

BANCA: ${profile.nome}
CHECKLIST DE ESTILO (obedeça rigidamente):
${checklist}

COMANDOS TÍPICOS (use para variar o texto):
${comandos}

DIFICULDADE: ${dificuldade}
TEMA: ${temaStr}

OBJETIVO:
- Gerar um pacote de questões com cara de prova real (sem enfeites).
- Distratores plausíveis; erros por detalhe técnico/semântico.
- Não use emojis, não use markdown.

SAÍDA (JSON estrito):
- Gere exatamente ${qtdMCQ} questões "mcq" (4 alternativas).
- Gere exatamente ${qtdCE} questões "ce" (Certo/Errado).
- Gere exatamente ${qtdDisc} questões "disc" (discursivas).

REGRAS POR TIPO:

1) MCQ:
- "tipo": "mcq"
- "enunciado": string curta e clara (pode ter mini-cenário)
- "alternativas": array com 4 strings (NÃO colocar A/B/C/D)
- "corretaIndex": inteiro 0..3
- "explicacao": 1 a 3 frases, objetiva, apontando o detalhe decisivo

2) CE (Certo/Errado):
- "tipo": "ce"
- "enunciado": uma assertiva para julgar (estilo banca)
- "alternativas": SEMPRE ["Certo","Errado"]
- "corretaIndex": 0 (Certo) ou 1 (Errado)
- "explicacao": 1 a 3 frases, objetiva, apontando a condição/exceção

3) Discursiva:
- "tipo": "disc"
- "enunciado": pergunta (comando claro)
- "respostaModelo": 4 a 10 linhas no máximo
- "criterios": array com 3 a 6 itens curtos (o que avaliar)
- Não colocar "alternativas" nas discursivas

FORMATO: responda SOMENTE em JSON válido exatamente neste schema:

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
  ],
  "discursivas": [
    {
      "tipo": "disc",
      "enunciado": "...",
      "respostaModelo": "...",
      "criterios": ["...", "..."]
    }
  ]
}

QUALIDADE:
- NÃO repita enunciados.
- NÃO repita alternativas com frases quase iguais.
- Explique com precisão e sem floreio.
`.trim();
}

async function callOpenAI({ apiKey, prompt, temperature = 0.4, maxTokens = 2400 }) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature,
      max_tokens: maxTokens,
      messages: [
        {
          role: "system",
          content:
            "Você gera questões em JSON rigoroso. Responda apenas JSON válido conforme o schema pedido, sem markdown."
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
      `OpenAI HTTP ${resp.status}: ${errJson?.error?.message || rawText.slice(0, 300)}`
    );
  }

  const data = safeJsonParse(rawText);
  const content = data?.choices?.[0]?.message?.content || "";
  return String(content || "").trim();
}

function sanitizeMCQ(items, wantCount) {
  const out = [];
  const seenEnun = new Set();

  for (const q of items || []) {
    if (!q || typeof q.enunciado !== "string") continue;

    const enun = String(q.enunciado).trim();
    const enunKey = normalizeText(enun);
    if (!enun || seenEnun.has(enunKey)) continue;

    const alts = Array.isArray(q.alternativas) ? q.alternativas.map((a) => String(a).trim()) : [];
    if (alts.length < 4) continue;

    const pick4 = alts.slice(0, 4).filter((a) => !isTooShort(a, 4));
    if (pick4.length !== 4) continue;

    if (hasDuplicateAlternatives(pick4)) continue;
    if (lowVarietyAlternatives(pick4)) continue;

    const idx = clamp(q.corretaIndex ?? 0, 0, 3);
    const exp = String(q.explicacao || "").trim();

    if (isTooShort(exp, 30)) continue;

    seenEnun.add(enunKey);
    out.push({
      tipo: "mcq",
      enunciado: enun,
      alternativas: pick4,
      corretaIndex: idx,
      explicacao: exp
    });

    if (out.length >= wantCount) break;
  }

  return out;
}

function sanitizeCE(items, wantCount) {
  const out = [];
  const seenEnun = new Set();

  for (const q of items || []) {
    if (!q || typeof q.enunciado !== "string") continue;

    const enun = String(q.enunciado).trim();
    const enunKey = normalizeText(enun);
    if (!enun || seenEnun.has(enunKey)) continue;

    const idx = clamp(q.corretaIndex ?? 0, 0, 1);
    const exp = String(q.explicacao || "").trim();
    if (isTooShort(exp, 25)) continue;

    seenEnun.add(enunKey);
    out.push({
      tipo: "ce",
      enunciado: enun,
      alternativas: ["Certo", "Errado"],
      corretaIndex: idx,
      explicacao: exp
    });

    if (out.length >= wantCount) break;
  }

  return out;
}

function sanitizeDisc(items, wantCount) {
  const out = [];
  const seenEnun = new Set();

  for (const d of items || []) {
    if (!d || typeof d.enunciado !== "string" || typeof d.respostaModelo !== "string") continue;

    const enun = String(d.enunciado).trim();
    const enunKey = normalizeText(enun);
    if (!enun || seenEnun.has(enunKey)) continue;

    const resp = String(d.respostaModelo).trim();
    const criterios = Array.isArray(d.criterios) ? d.criterios.map((c) => String(c).trim()).filter(Boolean) : [];

    if (isTooShort(resp, 40)) continue;
    if (criterios.length < 3) continue;

    seenEnun.add(enunKey);
    out.push({
      tipo: "disc",
      enunciado: enun,
      respostaModelo: resp,
      criterios: criterios.slice(0, 8)
    });

    if (out.length >= wantCount) break;
  }

  return out;
}

// Intercala MCQ e CE para ficar “misturado” no simulado
function interleave(mcq, ce) {
  const out = [];
  let i = 0, j = 0;

  // padrão: 2 MCQ : 1 CE (ajusta automaticamente)
  while (i < mcq.length || j < ce.length) {
    if (i < mcq.length) out.push(mcq[i++]);
    if (i < mcq.length) out.push(mcq[i++]);
    if (j < ce.length) out.push(ce[j++]);
  }
  return out;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Use POST" });
    }

    const { banca, qtd, dificuldade, tema, qtdCE, qtdDiscursivas } = req.body || {};

    const BANCA = String(banca || "FGV");
    const DIFIC = String(dificuldade || "misturado");
    const TEMA = String(tema || "").trim();

    const profile = bancaProfile(BANCA);
    const mix = computeMixCounts(qtd ?? 5, qtdCE, qtdDiscursivas, profile.id);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "OPENAI_API_KEY ausente no ambiente" });
    }

    // 1) chamada principal
    const prompt = buildPrompt({
      profile,
      dificuldade: DIFIC,
      tema: TEMA,
      qtdMCQ: mix.mcq,
      qtdCE: mix.ce,
      qtdDisc: mix.disc
    });

    let content = "";
    try {
      content = await callOpenAI({ apiKey, prompt, temperature: 0.4, maxTokens: 2600 });
    } catch (e) {
      return res.status(500).json({
        ok: false,
        error: "Falha ao chamar OpenAI",
        detail: String(e?.message || e)
      });
    }

    let parsed = safeJsonParse(content);
    if (!parsed) parsed = extractJsonObject(content);

    if (!parsed || typeof parsed !== "object") {
      return res.status(200).json({
        ok: false,
        error: "Modelo não retornou JSON no formato esperado",
        rawPreview: String(content).slice(0, 400)
      });
    }

    // sane inicial
    let saneMCQ = sanitizeMCQ(parsed.mcq || [], mix.mcq);
    let saneCE = sanitizeCE(parsed.ce || [], mix.ce);
    let saneDisc = sanitizeDisc(parsed.discursivas || [], mix.disc);

    // 2) repair pass (completar faltantes)
    const needMCQ = Math.max(0, mix.mcq - saneMCQ.length);
    const needCE = Math.max(0, mix.ce - saneCE.length);
    const needDisc = Math.max(0, mix.disc - saneDisc.length);

    if (needMCQ || needCE || needDisc) {
      const repairPrompt = buildPrompt({
        profile,
        dificuldade: DIFIC,
        tema: TEMA,
        qtdMCQ: needMCQ,
        qtdCE: needCE,
        qtdDisc: needDisc
      });

      try {
        const repairContent = await callOpenAI({
          apiKey,
          prompt: repairPrompt,
          temperature: 0.35,
          maxTokens: 2000
        });

        let repairParsed = safeJsonParse(repairContent);
        if (!repairParsed) repairParsed = extractJsonObject(repairContent);

        if (repairParsed && typeof repairParsed === "object") {
          const extraMCQ = sanitizeMCQ(repairParsed.mcq || [], needMCQ);
          const extraCE = sanitizeCE(repairParsed.ce || [], needCE);
          const extraDisc = sanitizeDisc(repairParsed.discursivas || [], needDisc);

          saneMCQ = saneMCQ.concat(extraMCQ).slice(0, mix.mcq);
          saneCE = saneCE.concat(extraCE).slice(0, mix.ce);
          saneDisc = saneDisc.concat(extraDisc).slice(0, mix.disc);
        }
      } catch (e) {
        // se repair falhar, devolve o que tiver (não quebra)
        console.warn("⚠️ Repair pass falhou:", e);
      }
    }

    // Se ainda não tiver N total para questoes (MCQ+CE), tenta salvar com fallback mínimo
    const questoesMix = interleave(saneMCQ, saneCE);
    const questoesFinal = questoesMix.slice(0, mix.mcq + mix.ce);

    if (!questoesFinal.length) {
      return res.status(200).json({
        ok: false,
        error: "Questões inválidas após validação",
        rawPreview: String(content).slice(0, 400)
      });
    }

    return res.status(200).json({
      ok: true,
      // ✅ FRONT ATUAL: use `questoes` (mistura MCQ + CE) com alternativas >= 2
      questoes: questoesFinal,
      // ✅ extras úteis (debug / UI futura)
      ce: saneCE,
      discursivas: saneDisc,
      meta: {
        banca: BANCA,
        perfilBanca: profile.id,
        dificuldade: DIFIC,
        tema: TEMA,
        qtdTotal: mix.total,
        qtdMCQ: mix.mcq,
        qtdCE: mix.ce,
        qtdDiscursivas: mix.disc
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
