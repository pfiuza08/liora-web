// /api/hotmart-webhook.js
// ==========================================================
// LIORA — Hotmart Webhook -> Supabase (v2.2 TRIAL-SAFE)
// - Mapeia eventos Hotmart (ON/OFF/IGNORED) conforme lista do painel
// - Usa RPC get_uid_by_email para achar uid com precisão
// - Se uid existe: upsert em profiles (id = uid)
// - Se uid não existe: upsert em premium_pending
//
// Eventos (Hotmart):
//  ON  : Compra aprovada | Compra completa | Primeiro acesso | Troca de plano | Atualização de Data de Cobrança de Assinatura
//  OFF : Cancelamento de Assinatura | Compra reembolsada | Pedido de reembolso | Chargeback | Compra cancelada | Compra expirada
//  IGN : Aguardando pagamento | Compra atrasada | Abandono de carrinho (e outros não reconhecidos)
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

function normalizeEventName(s) {
  // Normaliza para bater “cancelamento de assinatura” vs “Cancelamento de Assinatura”, etc.
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function premiumActionFromEvent(eventNameRaw) {
  const e = normalizeEventName(eventNameRaw);

  // 🔓 Libera Premium (inclui trial via “Primeiro acesso” e casos de assinatura ativa)
  const enable = [
    "compra aprovada",
    "compra completa",
    "primeiro acesso",
    "troca de plano",
    "atualização de data de cobrança de assinatura"
  ];

  // 🔒 Remove Premium (perda de direito)
  const disable = [
    "cancelamento de assinatura",
    "compra reembolsada",
    "pedido de reembolso",
    "chargeback",
    "compra cancelada",
    "compra expirada"
  ];

  // 💤 Eventos informativos (não mudam premium)
  const ignored = ["aguardando pagamento", "compra atrasada", "abandono de carrinho"];

  if (enable.some((k) => e.includes(k))) return { premium: true, reason: "enable", matched: enable.find((k) => e.includes(k)) };
  if (disable.some((k) => e.includes(k))) return { premium: false, reason: "disable", matched: disable.find((k) => e.includes(k)) };
  if (ignored.some((k) => e.includes(k))) return { premium: null, reason: "ignored", matched: ignored.find((k) => e.includes(k)) };

  // Qualquer coisa desconhecida: ignora (não quebra produção)
  return { premium: null, reason: "ignored_unknown", matched: null };
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
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!resp.ok) {
    throw new Error(
      `RPC get_uid_by_email failed ${resp.status}: ${
        typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)
      }`
    );
  }

  // A função retorna uuid (string) ou null
  const uid = typeof data === "string" ? data : null;
  return uid && uid.length >= 10 ? uid : null;
}

function buildHotmartMeta(payload, eventName) {
  const p = payload || {};
  const planName =
    p?.data?.purchase?.plan?.name ||
    p?.data?.purchase?.subscription?.plan?.name ||
    p?.data?.subscription?.plan?.name ||
    p?.data?.plan?.name ||
    p?.plan ||
    null;

  const purchaseId =
    p?.data?.purchase?.transaction ||
    p?.data?.purchase?.id ||
    p?.data?.purchase_id ||
    p?.data?.id ||
    p?.id ||
    null;

  const subscriptionId =
    p?.data?.subscription?.id ||
    p?.data?.purchase?.subscription?.id ||
    p?.data?.subscription_id ||
    null;

  const status =
    p?.data?.purchase?.status ||
    p?.data?.subscription?.status ||
    p?.data?.status ||
    null;

  return {
    hotmart_event: eventName,
    hotmart_event_norm: normalizeEventName(eventName),
    hotmart_plan: planName,
    hotmart_purchase_id: purchaseId,
    hotmart_subscription_id: subscriptionId,
    hotmart_status: status
  };
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
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

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
    updated_at: new Date().toISOString(),
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
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

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

    // Não altera premium para eventos ignorados/unknown
    if (act.premium === null) {
      return json(res, 200, {
        ok: true,
        ignored: true,
        reason: act.reason,
        matched: act.matched,
        event: eventName,
        email
      });
    }

    const meta = buildHotmartMeta(payload, eventName);

    // ✅ Lookup correto
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
        event: eventName,
        matched: act.matched,
        email,
        premium: act.premium,
        applied_to: "profiles",
        uid,
        updated
      });
    }

    // Se não existe no Auth, vai para pending (para aplicar quando a pessoa logar 1ª vez)
    const pending = await upsertPendingByEmail({
      supabaseUrl,
      serviceKey,
      email,
      premium: act.premium,
      meta
    });

    return json(res, 200, {
      ok: true,
      event: eventName,
      matched: act.matched,
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
