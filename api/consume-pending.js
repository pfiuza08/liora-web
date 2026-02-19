// /api/consume-pending.js
// ==========================================================
// LIORA — Consume Premium Pending (Server-side, seguro) v1.2
// - Recebe JWT do Supabase no header Authorization: Bearer <token>
// - Valida usuário via Supabase Auth (server)
// - (Opcional) aceita body.email e exige bater com user.email (anti-abuso)
// - Busca premium_pending pelo email do user
// - Se premium=true: upsert em profiles (id = user.id) + delete pending
//
// ENVs (Vercel):
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// ==========================================================

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function nowIso() {
  return new Date().toISOString();
}

function safeStr(x, max = 220) {
  const s = String(x ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function maskEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  const at = e.indexOf("@");
  if (at <= 1) return e ? "***@***" : "";
  const user = e.slice(0, at);
  const dom = e.slice(at + 1);
  return `${user[0]}***${user[user.length - 1]}@${dom}`;
}

function getBearerToken(req) {
  const h = String(req.headers?.authorization || "").trim();
  if (!h.toLowerCase().startsWith("bearer ")) return "";
  return h.slice(7).trim();
}

async function sbGetUser({ supabaseUrl, anonOrServiceKey, token }) {
  const url = `${supabaseUrl}/auth/v1/user`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      apikey: anonOrServiceKey,
      Authorization: `Bearer ${token}`
    }
  });

  const text = await resp.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!resp.ok) {
    throw new Error(
      `getUser failed ${resp.status}: ${
        typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)
      }`
    );
  }

  return data; // { id, email, ... }
}

async function sbSelectPending({ supabaseUrl, serviceKey, email }) {
  const url =
    `${supabaseUrl}/rest/v1/premium_pending` +
    `?select=email,premium,plan,last_event,last_status,payload_id,updated_at` +
    `&email=eq.${encodeURIComponent(email)}` +
    `&limit=1`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "count=exact"
    }
  });

  const text = await resp.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!resp.ok) {
    throw new Error(
      `pending select failed ${resp.status}: ${
        typeof data === "string" ? data.slice(0, 250) : JSON.stringify(data).slice(0, 250)
      }`
    );
  }

  const row = Array.isArray(data) ? data[0] : null;
  return row || null;
}

async function sbUpsertProfile({ supabaseUrl, serviceKey, uid, email, meta }) {
  const url = `${supabaseUrl}/rest/v1/profiles?on_conflict=id`;

  const payload = {
    id: uid,
    email,
    premium: true,
    premium_source: "hotmart",
    premium_updated_at: nowIso(),
    hotmart_event: meta?.hotmart_event || "pending",
    hotmart_status: meta?.hotmart_status || null,
    hotmart_payload_id: meta?.hotmart_payload_id || null,
    hotmart_plan: meta?.hotmart_plan || null
  };

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
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!resp.ok) {
    throw new Error(
      `profiles upsert failed ${resp.status}: ${
        typeof data === "string" ? data.slice(0, 250) : JSON.stringify(data).slice(0, 250)
      }`
    );
  }

  return data;
}

async function sbDeletePending({ supabaseUrl, serviceKey, email }) {
  const url = `${supabaseUrl}/rest/v1/premium_pending?email=eq.${encodeURIComponent(email)}`;

  const resp = await fetch(url, {
    method: "DELETE",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    }
  });

  const text = await resp.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!resp.ok) {
    throw new Error(
      `pending delete failed ${resp.status}: ${
        typeof data === "string" ? data.slice(0, 250) : JSON.stringify(data).slice(0, 250)
      }`
    );
  }

  return data;
}

export default async function handler(req, res) {
  const reqId = `cp_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  try {
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Use POST", reqId });

    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!supabaseUrl || !serviceKey) {
      return json(res, 500, { ok: false, error: "missing supabase env", reqId });
    }

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { ok: false, error: "missing_bearer_token", reqId });

    // 1) valida sessão e obtém user/email via Auth
    let user = null;
    try {
      user = await sbGetUser({ supabaseUrl, anonOrServiceKey: serviceKey, token });
    } catch (e) {
      return json(res, 401, {
        ok: false,
        error: "invalid_session",
        reqId,
        detail: safeStr(e?.message || e)
      });
    }

    const uid = String(user?.id || "").trim();
    const email = String(user?.email || "").trim().toLowerCase();
    if (!uid || !email) return json(res, 400, { ok: false, error: "user_missing_email", reqId });

    // 1.1) (Opcional) se mandarem email no body, exige bater com o email do user logado
    // Isso evita alguém logado tentar "ativar" outro email.
    let bodyEmail = "";
    try {
      bodyEmail = String(req.body?.email || "").trim().toLowerCase();
    } catch {}
    if (bodyEmail && bodyEmail !== email) {
      return json(res, 403, { ok: false, error: "email_mismatch", reqId });
    }

    // 2) busca pending
    const pending = await sbSelectPending({ supabaseUrl, serviceKey, email });

    console.log("🧾 consume-pending", {
      reqId,
      at: nowIso(),
      uid: uid.slice(0, 8) + "…",
      email: maskEmail(email),
      hasPending: !!pending,
      pendingPremium: pending?.premium === true
    });

    if (!pending) {
      return json(res, 200, { ok: true, reqId, consumed: false, pending_found: false });
    }

    if (pending.premium !== true) {
      return json(res, 200, {
        ok: true,
        reqId,
        consumed: false,
        pending_found: true,
        pending_premium: false
      });
    }

    // 3) aplica premium em profiles
    const meta = {
      hotmart_event: pending.last_event || "pending",
      hotmart_status: pending.last_status || null,
      hotmart_payload_id: pending.payload_id || null,
      hotmart_plan: pending.plan || null
    };

    await sbUpsertProfile({ supabaseUrl, serviceKey, uid, email, meta });

    // 4) remove pending (se falhar, a pessoa pode tentar de novo sem perder premium em profiles)
    try {
      await sbDeletePending({ supabaseUrl, serviceKey, email });
    } catch (e) {
      console.warn("⚠️ pending delete falhou (não crítico):", {
        reqId,
        at: nowIso(),
        message: safeStr(e?.message || e)
      });
    }

    return json(res, 200, {
      ok: true,
      reqId,
      consumed: true,
      premium: true
    });
  } catch (err) {
    console.error("❌ consume-pending error:", {
      reqId,
      at: nowIso(),
      message: safeStr(err?.message || err)
    });
    return json(res, 500, {
      ok: false,
      error: "internal_error",
      reqId,
      detail: safeStr(err?.message || err)
    });
  }
}
