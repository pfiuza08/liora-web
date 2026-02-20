// /api/founder.js
// ==========================================================
// LIORA — Founder lead capture -> Supabase (server-side)
// - Recebe { name, email, niche, banca }
// - Salva em public.founder_leads
// - Retorna cupom sugerido
// ==========================================================

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function safeStr(x, max = 140) {
  const s = String(x ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function normalizeEmail(x) {
  return String(x || "").trim().toLowerCase();
}

export default async function handler(req, res) {
  const reqId = `fd_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  try {
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Use POST", reqId });

    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!supabaseUrl || !serviceKey) {
      return json(res, 500, { ok: false, error: "missing supabase env", reqId });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const name = safeStr(body?.name || "", 80);
    const email = normalizeEmail(body?.email || "");
    const niche = safeStr(body?.niche || "", 80);
    const banca = safeStr(body?.banca || "", 60);

    if (!email || !email.includes("@")) {
      return json(res, 400, { ok: false, error: "invalid_email", reqId });
    }

    const page_url = safeStr(req.headers?.referer || body?.page_url || "", 220);
    const user_agent = safeStr(req.headers?.["user-agent"] || "", 220);

    const payload = { name, email, niche, banca, page_url, user_agent };

    const url = `${supabaseUrl}/rest/v1/founder_leads`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(payload)
    });

    const text = await resp.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!resp.ok) {
      return json(res, 500, {
        ok: false,
        error: "supabase_insert_failed",
        reqId,
        detail: typeof data === "string" ? data.slice(0, 400) : JSON.stringify(data).slice(0, 400)
      });
    }

    // Cupom fixo (seu texto já mostra FOUNDER30)
    return json(res, 200, { ok: true, reqId, coupon: "FOUNDER30" });
  } catch (e) {
    return json(res, 500, { ok: false, error: "server_error", reqId, detail: String(e?.message || e) });
  }
}
