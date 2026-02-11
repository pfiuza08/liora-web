// =============================================================
// 🔐 LIORA — AUTH (Supabase Magic Link) v1.2 (profiles + premium + pending)
// Exporta: auth
// =============================================================
export const auth = {
  sb: null,
  session: null,
  user: null,

  init(ctx) {
    const SUPABASE_URL = "https://uevtpcvwfuqwopqyqcym.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_BH6_JtxfBj9csk5vkmX4DA_cGRP9ZUb";

    if (!window.supabase?.createClient) {
      console.warn("⚠️ supabase-js não carregou (CDN).");
      return;
    }

    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });

    // sessão atual
    this.sb.auth.getSession().then(({ data }) => {
      this._handleSession(ctx, data?.session || null);
    });

    // mudanças de auth
    this.sb.auth.onAuthStateChange((_event, session) => {
      this._handleSession(ctx, session || null);
    });
  },

  // ---------------------------------------------------------
  // ✅ Consome premium pendente (compra antes do login)
  // - procura em premium_pending por email
  // - se premium=true, aplica em profiles (id = auth user id)
  // - remove o pending
  // ---------------------------------------------------------
  async _consumePendingPremium(email) {
    try {
      const sb = this.sb;
      const u = this.user;

      const e = String(email || "").trim().toLowerCase();
      if (!sb || !u?.id || !e) return { consumed: false };

      // 1) busca pendência
      const { data: pending, error: e1 } = await sb
        .from("premium_pending")
        .select("email, premium, plan, last_event, payload_id, updated_at")
        .eq("email", e)
        .maybeSingle();

      if (e1) {
        console.warn("⚠️ pending select error:", e1);
        return { consumed: false, error: e1.message };
      }

      if (!pending || pending.premium !== true) {
        return { consumed: false };
      }

      // 2) aplica em profiles (respeita FK: profiles.id = auth.users.id)
      const { error: e2 } = await sb
        .from("profiles")
        .upsert(
          {
            id: u.id,
            email: e,
            premium: true,
            premium_source: "hotmart",
            premium_updated_at: new Date().toISOString(),
            hotmart_event: pending.last_event || "pending",
            hotmart_payload_id: pending.payload_id || null
          },
          { onConflict: "id" }
        );

      if (e2) {
        console.warn("⚠️ profiles upsert error:", e2);
        return { consumed: false, error: e2.message };
      }

      // 3) remove pendência
      const { error: e3 } = await sb.from("premium_pending").delete().eq("email", e);
      if (e3) console.warn("⚠️ pending delete error:", e3);

      return { consumed: true };
    } catch (err) {
      console.warn("⚠️ consume pending exception:", err);
      return { consumed: false, error: String(err?.message || err) };
    }
  },

  async _handleSession(ctx, session) {
    this.session = session;
    this.user = session?.user || null;

    if (!this.user) {
      // desloga no store local (para não ficar "Free/Premium" falso)
      ctx?.store?.remove?.("user");
      window.dispatchEvent(new Event("liora:user-changed"));
      window.dispatchEvent(new Event("liora:dashboard-refresh"));
      return;
    }

    const fallbackName =
      this.user?.user_metadata?.full_name ||
      this.user?.user_metadata?.name ||
      "";

    const fallbackEmail = this.user?.email || "";

    // ---------------------------------------------------------
    // ✅ Se houver compra antes do login, promove pending -> profiles
    // ---------------------------------------------------------
    if (fallbackEmail) {
      const pend = await this._consumePendingPremium(fallbackEmail);
      if (pend?.consumed) {
        console.log("✅ Premium pendente aplicado (Hotmart → profiles).");
      }
    }

    // ---------------------------------------------------------
    // ✅ Busca profile (premium) e espelha no store do MVP
    // ---------------------------------------------------------
    let premium = false;
    let name = fallbackName;
    let email = fallbackEmail;

    try {
      const { data, error } = await this.sb
        .from("profiles")
        .select("premium, name, email")
        .eq("id", this.user.id)
        .maybeSingle();

      if (!error && data) {
        premium = !!data.premium;
        const pName = String(data.name || "").trim();
        const pEmail = String(data.email || "").trim().toLowerCase();
        if (pName) name = pName;
        if (pEmail) email = pEmail;
      } else {
        // se não existir profile ainda, mantém fallback
      }
    } catch (e) {
      // fallback mantém premium=false
    }

    ctx?.store?.set?.("user", {
      uid: this.user.id,
      name,
      email,
      premium
    });

    window.dispatchEvent(new Event("liora:user-changed"));
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  },

  async sendMagicLink(email) {
    const e = String(email || "").trim().toLowerCase();
    return this.sb.auth.signInWithOtp({
      email: e,
      options: {
        // precisa estar permitido em Auth → URL Configuration → Redirect URLs
        emailRedirectTo: location.origin + "/app/"
      }
    });
  },

  async signOut() {
    return this.sb.auth.signOut();
  },

  isLogged() {
    return !!this.user?.id;
  }
};
