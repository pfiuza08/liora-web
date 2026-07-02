const originalHandler = require("../gerarPlano");
const {
  requireAuth,
  consumeDailyUsage,
  sendUsageLimit
} = require("../../lib/requireAuth");

module.exports = async function secureGerarPlano(req, res) {
  const context = await requireAuth(req, res);
  if (!context) return;

  const usage = await consumeDailyUsage(context, "tema", 1);
  if (!usage.ok) return sendUsageLimit(res, usage, "tema");

  req.lioraAuth = context;
  return originalHandler(req, res);
};
