// /api/hotmart-webhook.js
// ==========================================================
// LIORA — Hotmart Webhook -> Supabase profiles.premium
// Vercel Serverless Function (Node)
// ==========================================================

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

// tenta achar o e-mail do comprador em vários caminhos comuns
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

  // fallback: varre o objeto procurando algo que pareça e-mail
  try {
    const flat = JSON.stringify(p);
    const m = flat.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (m?.[0]) return String(m[0]).trim().toLowerCase();
  } catch {}

  return null;
}

// normaliza o nome do evento (Hotmart 2.0 aparece PT-BR no seu menu)
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
  )
    .trim();
}

// mapeia eventos -> ação premium
function premiumActionFromEvent(eventNameRaw) {
  const e = String(eventNameRaw || "").toLowerCase();

  // ✅ ligar premium
  const enable = [
    "compra aprovada",
    "compra completa",
    "primeiro acesso"
  ];

  // ❌ desligar premium
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

// chama Supabase REST (sem SDK)
async function supabaseUpsertProfile({ supabaseUrl, serviceKey, email, premium, meta }) {
  const url = `${supabaseUrl}/rest/v1/profiles?on_conflict=email`;
  const body = {
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
    body: JSON.stringify(body)
  });

  const text = await resp.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!resp.ok) {
    throw new Error(`Supabase upsert failed ${resp.status}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
  }

  return data;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return json(res, 405, { ok: false, error: "Use POST" });
    }

    // token simples (querystring)
    const expected = String(process.env.HOTMART_WEBHOOK_TOKEN || "").trim();
    const got = String(req.query?.token || "").trim();

    if (!expected) {
      return json(res, 500, { ok: false, error: "HOTMART_WEBHOOK_TOKEN ausente no ambiente" });
    }
    if (got !== expected) {
      return json(res, 401, { ok: false, error: "invalid_token" });
    }

    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!supabaseUrl || !serviceKey) {
      return json(res, 500, { ok: false, error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente" });
    }

    const payload = req.body || {};
    const eventName = extractEventName(payload);
    const email = extractBuyerEmail(payload);

    if (!eventName) {
      return json(res, 200, { ok: false, error: "event_missing", hint: "Payload sem nome de evento", payloadKeys: Object.keys(payload || {}) });
    }
    if (!email) {
      return json(res, 200, { ok: false, error: "email_missing", hint: "Não achei email do comprador no payload", event: eventName });
    }

    const act = premiumActionFromEvent(eventName);
    if (act.premium === null) {
      return json(res, 200, { ok: true, ignored: true, event: eventName, email });
    }

    // meta opcional para auditoria
    const meta = {
      hotmart_event: eventName,
      hotmart_payload_id: payload?.id || payload?.data?.id || null
    };

    const updated = await supabaseUpsertProfile({
      supabaseUrl,
      serviceKey,
      email,
      premium: act.premium,
      meta
    });

    return json(res, 200, {
      ok: true,
      event: eventName,
      email,
      premium: act.premium,
      updated
    });
  } catch (err) {
    console.error("❌ hotmart-webhook error:", err);
    return json(res, 500, {
      ok: false,
      error: "internal_error",
      detail: String(err?.message || err)
    });
  }
}
