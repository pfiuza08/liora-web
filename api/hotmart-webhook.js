// /api/hotmart-webhook.js
// ==========================================================
// LIORA — Hotmart Webhook -> Supabase (Robusto + logs seguros)
// - Usa RPC get_uid_by_email para achar uid com precisão
// - Se uid existe: upsert em profiles (id = uid)
// - Se uid não existe: upsert em premium_pending
//
// Melhorias:
// ✅ logs seguros (mascara email, não loga payload bruto)
// ✅ "trial-friendly": tenta inferir enable/disable por status no payload
// ✅ eventos enable/disable configuráveis por ENV (sem redeploy)
//
// ENVs esperadas (Vercel):
// - HOTMART_WEBHOOK_TOKEN
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Opcional:
// - HOTMART_ENABLE_EVENTS  (csv, ex: "Compra aprovada,Compra completa,Primeiro acesso")
// - HOTMART_DISABLE_EVENTS (csv, ex: "Cancelamento de Assinatura,Compra reembolsada,Chargeback")
// ==========================================================

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function nowIso() {
  return new Date().toISOString();
}

function maskEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  const at = e.indexOf("@");
  if (at <= 1) return e ? "***@***" : "";
  const user = e.slice(0, at);
  const dom = e.slice(at + 1);
  return `${user[0]}***${user[user.length - 1]}@${dom}`;
}

function safeStr(x, max = 180) {
  const s = String(x ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function normalize(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function csvToList(envValue) {
  const raw = String(envValue || "").trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
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

  // fallback: acha qualquer email no JSON stringify (último recurso)
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

// tenta capturar algum "status" útil do payload para ajudar em trial/assinatura
function extractPurchaseStatus(payload) {
  const p = payload || {};
  const candidates = [
    p?.data?.purchase?.status,
    p?.purchase?.status,
    p?.data?.subscription?.status,
    p?.subscription?.status,
    p?.data?.transaction?.status,
    p?.transaction?.status
  ];

  for (const c of candidates) {
    const s = String(c || "").trim();
    if (s) return s;
  }
  return "";
}

function premiumActionFromEventAndStatus(eventNameRaw, statusRaw, envEnableList, envDisableList) {
  const e = normalize(eventNameRaw);
  const st = normalize(statusRaw);

  // Defaults (bons para começar)
  const enableDefaults = [
    "compra aprovada",
    "compra completa",
    "primeiro acesso",
    "assinatura ativa",
    "pagamento aprovado",
    "compra paga",
    "renovacao de assinatura",
    "ativacao de assinatura",
    "liberacao de acesso"
  ];

  const disableDefaults = [
    "cancelamento de assinatura",
    "compra reembolsada",
    "compra cancelada",
    "chargeback",
    "compra expirada",
    "compra atrasada",
    "assinatura suspensa",
    "inadimplente"
  ];

  const enable = (envEnableList?.length ? envEnableList : enableDefaults).map(normalize);
  const disable = (envDisableList?.length ? envDisableList : disableDefaults).map(normalize);

  // 1) Primeiro pelo nome do evento
  if (enable.some((k) => e.includes(k))) return { premium: true, reason: "enable_by_event" };
  if (disable.some((k) => e.includes(k))) return { premium: false, reason: "disable_by_event" };

  // 2) Depois, por status (trial-friendly)
  // Aqui a ideia é: se algum status vier como "approved/paid/active", liga.
  // Se vier "canceled/refunded/chargeback/expired", desliga.
  const statusEnable = ["approved", "paid", "active", "completed", "complete", "aprovada", "paga", "ativa"];
  const statusDisable = ["canceled", "cancelled", "refunded", "chargeback", "expired", "reembolsada", "cancelada", "expirada"];

  if (st && statusEnable.some((k) => st.includes(k))) return { premium: true, reason: "enable_by_status" };
  if (st && statusDisable.some((k) => st.includes(k))) return { premium: false, reason: "disable_by_status" };

  return { premium: null, reason: "ignored" };
}

async function rpcGetUidByEmail({ supabaseUrl, serviceKey, email }) {
  const url = `${supabaseUrl}/rest/v1/rpc/get_uid_by_email`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ p_email: email })
  });

  const text = await resp.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!resp.ok) {
    throw new Error(
      `RPC get_uid_by_email failed ${resp.status}: ${
        typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)
      }`
    );
  }

  // pode retornar uuid string ou null
  const uid = typeof data === "string" ? data : null;
  return uid && uid.length >= 10 ? uid : null;
}

async function upsertProfilesById({ supabaseUrl, serviceKey, uid, email, premium, meta }) {
  const url = `${supabaseUrl}/rest/v1/profiles?on_conflict=id`;
  const payload = {
    id: uid,
    email,
    premium: !!premium,
    premium_source: "hotmart",
    premium_updated_at: nowIso(),
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
    updated_at: nowIso(),
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
  const reqId = `hm_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

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
    const status = extractPurchaseStatus(payload);

    const enableEnv = csvToList(process.env.HOTMART_ENABLE_EVENTS);
    const disableEnv = csvToList(process.env.HOTMART_DISABLE_EVENTS);

    if (!eventName) return json(res, 200, { ok: false, error: "event_missing", reqId });
    if (!email) return json(res, 200, { ok: false, error: "email_missing", event: eventName, reqId });

    const act = premiumActionFromEventAndStatus(eventName, status, enableEnv, disableEnv);

    // log seguro
    console.log("🔔 hotmart-webhook", {
      reqId,
      at: nowIso(),
      event: safeStr(eventName, 120),
      status: safeStr(status, 60),
      email: maskEmail(email),
      decision: act.reason,
      premium: act.premium
    });

    if (act.premium === null) {
      return json(res, 200, {
        ok: true,
        ignored: true,
        reqId,
        event: eventName,
        status,
        email: email
      });
    }

    const meta = {
      hotmart_event: safeStr(eventName, 120),
      hotmart_status: safeStr(status, 60),
      hotmart_payload_id: payload?.id || payload?.data?.id || null
    };

    const uid = await rpcGetUidByEmail({ supabaseUrl, serviceKey, email });

    if (uid) {
      const updated = await upsertProfilesById({
        supabaseUrl,
        serviceKey,
        uid,
        email,
        premium: act.premium,
        meta
      });

      return json(res, 200, {
        ok: true,
        reqId,
        event: eventName,
        status,
        email,
        premium: act.premium,
        applied_to: "profiles",
        uid,
        updated
      });
    }

    // não existe no Auth -> pending
    const pending = await upsertPendingByEmail({
      supabaseUrl,
      serviceKey,
      email,
      premium: act.premium,
      meta: {
        plan: payload?.data?.purchase?.plan?.name || payload?.plan || null,
        last_event: eventName,
        last_status: status || null,
        payload_id: meta.hotmart_payload_id
      }
    });

    return json(res, 200, {
      ok: true,
      reqId,
      event: eventName,
      status,
      email,
      premium: act.premium,
      applied_to: "premium_pending",
      pending
    });
  } catch (err) {
    console.error("❌ hotmart-webhook error:", {
      reqId,
      at: nowIso(),
      message: String(err?.message || err)
    });
    return json(res, 500, { ok: false, error: "internal_error", reqId, detail: String(err?.message || err) });
  }
}
