// public/app/auth-tier.js
// Resolve tier: visitor | free | premium

export async function resolveUserTier(supabase) {
  const { data: sess } = await supabase.auth.getSession();
  const session = sess?.session ?? null;

  if (!session) {
    return { tier: "visitor", session: null, profile: null };
  }

  const userId = session.user.id;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, name, premium, premium_since, hotmart_status, hotmart_plan")
    .eq("id", userId)
    .single();

  // Se por algum motivo não encontrar profile, trate como free (mais seguro que premium)
  if (error || !profile) {
    return { tier: "free", session, profile: null, profileError: error?.message };
  }

  const tier = profile.premium ? "premium" : "free";
  return { tier, session, profile };
}

// Gates (bloqueios) simples
export function requireLogin(tier) {
  if (tier === "visitor") {
    window.dispatchEvent(new CustomEvent("liora:open-login"));
    return false;
  }
  return true;
}

export function requirePremium(tier) {
  if (tier !== "premium") {
    window.dispatchEvent(new CustomEvent("liora:open-pricing"));
    return false;
  }
  return true;
}
