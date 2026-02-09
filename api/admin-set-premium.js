// /api/admin-set-premium.js
// ==========================================================
// LIORA — ADMIN (set premium by email)
// - Protegido por token
// - Atualiza public.profiles via Service Role
// ==========================================================
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Use POST" });
    }

    const token =
      req.headers["x-admin-token"] ||
      req.query.token ||
      "";

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
    const premiumRaw = body.premium;

    if (!email || !email.includes("@")) {
      return res.status(400).json({ ok: false, error: "email_invalid" });
    }

    // aceita true/false, "true"/"false", 1/0
    const premium =
      premiumRaw === true ||
      premiumRaw === "true" ||
      premiumRaw === 1 ||
      premiumRaw === "1";

    // Atualiza por email (precisa existir na tabela profiles)
    const url = `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`;

    const patch = {
      premium,
      premium_since: premium ? new Date().toISOString() : null,
      premium_source: premium ? "admin" : null
    };

    const resp = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify(patch)
    });

    const text = await resp.text();

    if (!resp.ok) {
      return res.status(500).json({
        ok: false,
        error: "supabase_patch_failed",
        detail: text.slice(0, 300)
      });
    }

    // Se não encontrou ninguém, Supabase costuma devolver []
    let updated = null;
    try { updated = JSON.parse(text); } catch {}

    if (Array.isArray(updated) && updated.length === 0) {
      return res.status(200).json({
        ok: false,
        error: "profile_not_found_for_email",
        hint: "Esse e-mail precisa ter feito login (Magic Link) pelo menos 1 vez para existir em profiles."
      });
    }

    return res.status(200).json({
      ok: true,
      email,
      premium,
      updated: Array.isArray(updated) ? updated[0] : updated
    });
  } catch (err) {
    console.error("admin-set-premium error:", err);
    return res.status(500).json({
      ok: false,
      error: "internal",
      detail: String(err?.message || err)
    });
  }
}
