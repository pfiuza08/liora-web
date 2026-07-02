import gerarPlanoModule from "./gerarPlano.js";
import gerarPlanoPdfModule from "./gerarPlanoPdf.js";
import gerarSimuladoHandler from "./gerarSimulado.js";
import aprofundarModule from "./aprofundar.js";
import authHelpers from "../lib/requireAuth.js";

const {
  requireAuth,
  requirePremium,
  consumeDailyUsage,
  sendUsageLimit
} = authHelpers;

const gerarPlanoHandler =
  typeof gerarPlanoModule === "function" ? gerarPlanoModule : gerarPlanoModule?.default;
const gerarPlanoPdfHandler =
  typeof gerarPlanoPdfModule === "function" ? gerarPlanoPdfModule : gerarPlanoPdfModule?.default;
const aprofundarHandler =
  typeof aprofundarModule === "function" ? aprofundarModule : aprofundarModule?.default;

function normalizeBody(req) {
  try {
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : { ...(req.body || {}) };
  } catch {
    return {};
  }
}

export default async function secureHandler(req, res) {
  const context = await requireAuth(req, res);
  if (!context) return;

  const feature = String(req?.query?.feature || "").trim().toLowerCase();
  req.lioraAuth = context;

  if (feature === "tema") {
    const usage = await consumeDailyUsage(context, "tema", 1);
    if (!usage.ok) return sendUsageLimit(res, usage, "tema");
    return gerarPlanoHandler(req, res);
  }

  if (feature === "pdf") {
    if (!requirePremium(context, res, "pdf")) return;
    return gerarPlanoPdfHandler(req, res);
  }

  if (feature === "aprofundar") {
    if (!requirePremium(context, res, "aprofundar")) return;
    return aprofundarHandler(req, res);
  }

  if (feature === "simulado") {
    const usage = await consumeDailyUsage(context, "simulado", 1);
    if (!usage.ok) return sendUsageLimit(res, usage, "simulado");

    if (!context.premium) {
      const body = normalizeBody(req);
      const maxQuestions = 5;

      if (body.qtd != null) {
        body.qtd = Math.min(maxQuestions, Math.max(1, Number(body.qtd || 1)));
      }
      if (body.qtdDiscursivas != null) {
        body.qtdDiscursivas = Math.min(
          maxQuestions,
          Math.max(1, Number(body.qtdDiscursivas || 1))
        );
      }

      req.body = body;
    }

    return gerarSimuladoHandler(req, res);
  }

  return res.status(404).json({
    error: "unknown_feature",
    message: "Funcionalidade protegida não encontrada."
  });
}
