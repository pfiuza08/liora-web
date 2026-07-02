const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://uevtpcvwfuqwopqyqcym.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_BH6_JtxfBj9csk5vkmX4DA_cGRP9ZUb";

function getBearerToken(req) {
  const raw = String(req?.headers?.authorization || req?.headers?.Authorization || "");
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

async function getPremium(token, userId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=premium&limit=1`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
          Accept: "application/json"
        }
      }
    );

    if (!response.ok) return false;
    const rows = await response.json().catch(() => []);
    return !!rows?.[0]?.premium;
  } catch {
    return false;
  }
}

async function requireAuth(req, res) {
  const token = getBearerToken(req);

  if (!token) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json({
      error: "authentication_required",
      message: "Entre na Liora para usar esta funcionalidade."
    });
    return null;
  }

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });
  } catch (error) {
    console.error("liora_auth_unavailable", { message: String(error?.message || error) });
    res.status(503).json({
      error: "authentication_unavailable",
      message: "Não foi possível validar seu acesso agora. Tente novamente."
    });
    return null;
  }

  if (!response.ok) {
    res.setHeader("Cache-Control", "no-store");
    res.status(401).json({
      error: "invalid_session",
      message: "Sua sessão expirou. Entre novamente."
    });
    return null;
  }

  const user = await response.json().catch(() => null);
  if (!user?.id) {
    res.status(401).json({
      error: "invalid_session",
      message: "Sua sessão não pôde ser validada."
    });
    return null;
  }

  const premium = await getPremium(token, user.id);
  const context = { token, user, premium };

  console.log("liora_authenticated_use", {
    userId: user.id,
    email: user.email || null,
    premium,
    path: req?.url || null
  });

  return context;
}

function requirePremium(context, res, feature) {
  if (context?.premium) return true;

  res.status(403).json({
    error: "premium_required",
    feature,
    message: "Esta funcionalidade está disponível no plano Premium."
  });
  return false;
}

async function consumeDailyUsage(context, feature, limit) {
  if (context?.premium) {
    return { ok: true, premium: true, enforced: true, used: 0, limit: null };
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_liora_usage`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${context.token}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ p_feature: feature, p_limit: limit })
    });

    const payload = await response.json().catch(() => null);

    // A migração pode ainda não ter sido aplicada. Nesse caso, mantém o app
    // funcionando com o gate do frontend e registra a ausência da RPC.
    if (!response.ok) {
      console.warn("liora_usage_rpc_unavailable", {
        status: response.status,
        feature,
        payload
      });
      return { ok: true, enforced: false, used: null, limit };
    }

    return {
      ok: payload?.ok !== false,
      enforced: true,
      used: Number(payload?.used || 0),
      limit: Number(payload?.limit || limit)
    };
  } catch (error) {
    console.warn("liora_usage_rpc_error", {
      feature,
      message: String(error?.message || error)
    });
    return { ok: true, enforced: false, used: null, limit };
  }
}

function sendUsageLimit(res, usage, feature) {
  return res.status(429).json({
    error: "free_limit_reached",
    feature,
    used: usage?.used ?? null,
    limit: usage?.limit ?? null,
    message: "Você atingiu o limite diário do plano Free."
  });
}

module.exports = {
  requireAuth,
  requirePremium,
  consumeDailyUsage,
  sendUsageLimit
};
