const originalHandler = require("../gerarPlanoPdf");
const { requireAuth, requirePremium } = require("../../lib/requireAuth");

module.exports = async function secureGerarPlanoPdf(req, res) {
  const context = await requireAuth(req, res);
  if (!context) return;
  if (!requirePremium(context, res, "pdf")) return;

  req.lioraAuth = context;
  return originalHandler(req, res);
};
