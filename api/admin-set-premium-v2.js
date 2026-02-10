// /api/admin-set-premium-v2.js
// ==========================================================
// LIORA — ADMIN (set premium by email) v2
// - Não depende de trigger de profiles
// - Acha user no Auth e faz UPSERT em public.profiles
// ==========================================================
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Use POST" });
    }

    const token = req.headers["x-admin-token"] || req.query.token || "";
    if (!process.env.ADMIN_PREMIUM_TOKEN || token !== process.env.ADMIN_PREMIUM_TOKEN) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ ok: false, error: "missing supabase env" });
    }

    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return res.status(400).json({ ok: false, error: "email_invalid" });
    }

    const premiumRaw = body.premium;
    const premium =
      premiumRaw === true ||
      premiumRaw === "true" ||
      premiumRaw === 1 ||
      premiumRaw === "1";

    // ------------------------------------------------------
    // 1) Busca usuário no Auth Admin API
    // ------------------------------------------------------
    // GET /auth/v1/admin/users?email=...
    const findUrl = `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;

    const findResp = await fetch(findUrl, {
      method: "GET",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    });

    const findText = await findResp.text();
    if (!findResp.ok) {
      return res.status(500).json({
        ok: false,
        error: "auth_admin_lookup_failed",
        detail: findText.slice(0, 300)
      });
    }

    let found = null;
    try { found = JSON.parse(findText); } catch {}

    // A resposta pode variar; vamos tolerar
    const user =
      (Array.isArray(found?.users) && found.users[0]) ||
      (Array.isArray(found) && found[0]) ||
      found?.user ||
      null;

    if (!user?.id) {
      return res.status(200).json({
        ok: false,
        error: "auth_user_not_found",
        hint: "Esse e-mail precisa finalizar o login pelo menos 1 vez (gerar sessão)."
      });
    }

    const uid = user.id;
    const name =
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      "";

    // ------------------------------------------------------
    // 2) UPSERT em profiles (por id)
    // ------------------------------------------------------
    const upsertUrl = `${SUPABASE_URL}/rest/v1/profiles`;
    const payload = {
      id: uid,
      email,
      name: String(name || "").trim(),
      premium,
      premium_since: premium ? new Date().toISOString() : null,
      premium_source: premium ? "admin" : null
    };

    const upResp = await fetch(upsertUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(payload)
    });

    const upText = await upResp.text();
    if (!upResp.ok) {
      return res.status(500).json({
        ok: false,
        error: "profiles_upsert_failed",
        detail: upText.slice(0, 300)
      });
    }

    let updated = null;
    try { updated = JSON.parse(upText); } catch {}

    return res.status(200).json({
      ok: true,
      email,
      uid,
      premium,
      updated: Array.isArray(updated) ? updated[0] : updated
    });
  } catch (err) {
    console.error("admin-set-premium-v2 error:", err);
    return res.status(500).json({
      ok: false,
      error: "internal",
      detail: String(err?.message || err)
    });
  }
}
