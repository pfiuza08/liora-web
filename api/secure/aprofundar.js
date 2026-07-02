const originalHandler = require("../aprofundar");
const { requireAuth, requirePremium } = require("../../lib/requireAuth");

module.exports = async function secureAprofundar(req, res) {
  const context = await requireAuth(req, res);
  if (!context) return;
  if (!requirePremium(context, res, "aprofundar")) return;

  req.lioraAuth = context;
  return originalHandler(req, res);
};
