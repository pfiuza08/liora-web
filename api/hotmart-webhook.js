// /api/hotmart-webhook.js
// ==========================================================
// LIORA — Hotmart Webhook -> Supabase
// - Se usuário existe no Auth: grava premium em public.profiles (id = auth.users.id)
// - Se não existe: grava em public.premium_pending por email
// ==========================================================

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function extractBuyerEmail(payload) {
  const p = payload || {};
  const candidates = [
    p?.data?.buyer?.email,
    p?.data?.purchase?.buyer?.email,
    p?.buyer?.email,
    p?.purchase?.buyer?.email,
    p?.purchase?.buyer_email,
    p?.subscriber?.email,
    p?.data?.subscriber?.email,
    p?.data?.customer?.email,
    p?.customer?.email,
    p?.email
  ];

  for (const c of candidates) {
    const e = String(c || "").trim().toLowerCase();
    if (e && e.includes("@")) return e;
  }

  try {
    const flat = JSON.stringify(p);
    const m = flat.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (m?.[0]) return String(m[0]).trim().toLowerCase();
  } catch {}

  return null;
}

function extractEventName(payload) {
  const p = payload || {};
  return String(
    p?.event ||
      p?.event_name ||
      p?.type ||
      p?.name ||
      p?.data?.event ||
      p?.data?.event_name ||
      ""
  ).trim();
}

function premiumActionFromEvent(eventNameRaw) {
  const e = String(eventNameRaw || "").toLowerCase();

  const enable = ["compra aprovada", "compra completa", "primeiro acesso"];
  const disable = [
    "cancelamento de assinatura",
    "compra reembolsada",
    "compra cancelada",
    "chargeback",
    "compra expirada"
  ];

  if (enable.some((k) => e.includes(k))) return { premium: true, reason: "enable" };
  if (disable.some((k) => e.includes(k))) return { premium: false, reason: "disable" };
  return { premium: null, reason: "ignored" };
}

async function authFindUserByEmail({ supabaseUrl, serviceKey, email }) {
  // Admin API
  const url = `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    }
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Auth admin lookup failed ${resp.status}: ${text.slice(0, 250)}`);
  }

  let data = null;
  try { data = JSON.parse(text); } catch {}

  const user =
    (Array.isArray(data?.users) && data.users[0]) ||
    (Array.isArray(data) && data[0]) ||
    data?.user ||
    null;

  return user?.id ? user : null;
}

async function upsertProfilesById({ supabaseUrl, serviceKey, uid, email, premium, meta }) {
  const url = `${supabaseUrl}/rest/v1/profiles?on_conflict=id`;
  const payload = {
    id: uid,
    email,
    premium: !!premium,
    premium_source: "hotmart",
    premium_updated_at: new Date().toISOString(),
    ...meta
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
  try { data = JSON.parse(text); } catch { data = text; }

  if (!resp.ok) {
    throw new Error(
      `Supabase profiles upsert failed ${resp.status}: ${
        typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)
      }`
    );
  }

  return data;
}

async function upsertPendingByEmail({ supabaseUrl, serviceKey, email, premium, meta }) {
  const url = `${supabaseUrl}/rest/v1/premium_pending?on_conflict=email`;
  const payload = {
    email,
    premium: !!premium,
    source: "hotmart",
    ...meta
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
  try { data = JSON.parse(text); } catch { data = text; }

  if (!resp.ok) {
    throw new Error(
      `Supabase pending upsert failed ${resp.status}: ${
        typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)
      }`
    );
  }

  return data;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "Use POST" });

    const expected = String(process.env.HOTMART_WEBHOOK_TOKEN || "").trim();
    const got = String(req.query?.token || "").trim();
    if (!expected) return json(res, 500, { ok: false, error: "HOTMART_WEBHOOK_TOKEN ausente no ambiente" });
    if (got !== expected) return json(res, 401, { ok: false, error: "invalid_token" });

    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!supabaseUrl || !serviceKey) return json(res, 500, { ok: false, error: "missing supabase env" });

    const payload = req.body || {};
    const eventName = extractEventName(payload);
    const email = extractBuyerEmail(payload);

    if (!eventName) return json(res, 200, { ok: false, error: "event_missing" });
    if (!email) return json(res, 200, { ok: false, error: "email_missing", event: eventName });

    const act = premiumActionFromEvent(eventName);
    if (act.premium === null) return json(res, 200, { ok: true, ignored: true, event: eventName, email });

    const meta = {
      last_event: eventName,
      payload_id: payload?.id || payload?.data?.id || null
    };

    // 1) tenta achar user no Auth
    const user = await authFindUserByEmail({ supabaseUrl, serviceKey, email });

    if (user?.id) {
      const updated = await upsertProfilesById({
        supabaseUrl,
        serviceKey,
        uid: user.id,
        email,
        premium: act.premium,
        meta: {
          hotmart_event: meta.last_event,
          hotmart_payload_id: meta.payload_id
        }
      });

      return json(res, 200, {
        ok: true,
        event: eventName,
        email,
        premium: act.premium,
        applied_to: "profiles",
        uid: user.id,
        updated
      });
    }

    // 2) se não existe ainda, guarda pendente por email
    const pending = await upsertPendingByEmail({
      supabaseUrl,
      serviceKey,
      email,
      premium: act.premium,
      meta: {
        source: "hotmart",
        plan: payload?.data?.purchase?.plan?.name || payload?.plan || null,
        last_event: meta.last_event,
        payload_id: meta.payload_id
      }
    });

    return json(res, 200, {
      ok: true,
      event: eventName,
      email,
      premium: act.premium,
      applied_to: "premium_pending",
      pending
    });
  } catch (err) {
    console.error("❌ hotmart-webhook error:", err);
    return json(res, 500, { ok: false, error: "internal_error", detail: String(err?.message || err) });
  }
}
