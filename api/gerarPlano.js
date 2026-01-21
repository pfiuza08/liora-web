export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { tema, nivel } = req.body || {};
    if (!tema) return res.status(400).json({ error: "tema é obrigatório" });

    // ✅ MOCK ESTÁVEL (para o front ficar sólido)
    const sessoes = [
      {
        id: "S1",
        titulo: `Sessão 1 — Fundamentos de ${tema}`,
        objetivo: `Construir a base essencial de ${tema} (${nivel}).`,
        conteudo: {
          introducao: `Nesta sessão você vai entender o que é ${tema}, por que isso existe e onde aparece.`,
          conceitos: [
            `Definição e escopo de ${tema}`,
            "Principais termos e linguagem",
            "Onde costuma cair em prova/trabalho"
          ],
          exemplos: [
            `Exemplo simples aplicado a ${tema}`,
            "Exemplo com pegadinha comum"
          ],
          aplicacoes: [
            "Como identificar o conceito no enunciado",
            "Como evitar erro clássico"
          ],
          resumoRapido: [
            "O que é",
            "Para que serve",
            "Como reconhecer"
          ]
        }
      },
      {
        id: "S2",
        titulo: `Sessão 2 — Estruturas e componentes`,
        objetivo: `Entender as partes e como se conectam.`,
        conteudo: {
          introducao: `Agora você vai decompor ${tema} em blocos, e ver como cada parte se encaixa.`,
          conceitos: ["Componentes", "Relações entre componentes", "Variações do conceito"],
          exemplos: ["Exemplo guiado (passo a passo)"],
          aplicacoes: ["Como resolver questões por eliminação"],
          resumoRapido: ["Componentes-chave", "Interações", "Erros comuns"]
        }
      },
      {
        id: "S3",
        titulo: `Sessão 3 — Aplicação em questões`,
        objetivo: `Transformar teoria em resolução.`,
        conteudo: {
          introducao: `Aqui o foco é prática: interpretar e resolver.`,
          conceitos: ["Padrões de cobrança", "Palavras-chave no enunciado"],
          exemplos: ["Questão estilo banca: identifique o núcleo"],
          aplicacoes: ["Estratégia de resposta rápida", "Checklist mental"],
          resumoRapido: ["Ler", "Identificar", "Aplicar", "Conferir"]
        }
      }
    ];

    return res.status(200).json({
      meta: { tema, nivel },
      sessoes
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "server_error" });
  }
}
