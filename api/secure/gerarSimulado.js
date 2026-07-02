import originalHandler from "../gerarSimulado.js";
import authHelpers from "../_lib/requireAuth.js";

const {
  requireAuth,
  consumeDailyUsage,
  sendUsageLimit
} = authHelpers;

export default async function secureGerarSimulado(req, res) {
  const context = await requireAuth(req, res);
  if (!context) return;

  const usage = await consumeDailyUsage(context, "simulado", 1);
  if (!usage.ok) return sendUsageLimit(res, usage, "simulado");

  if (!context.premium) {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : { ...(req.body || {}) };
    const maxQuestions = 5;

    if (body.qtd != null) body.qtd = Math.min(maxQuestions, Math.max(1, Number(body.qtd || 1)));
    if (body.qtdDiscursivas != null) {
      body.qtdDiscursivas = Math.min(maxQuestions, Math.max(1, Number(body.qtdDiscursivas || 1)));
    }

    req.body = body;
  }

  req.lioraAuth = context;
  return originalHandler(req, res);
}
