// =============================================================
// 🔐 LIORA — AUTH (Supabase Magic Link) v1.1 (profiles + premium)
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
        const pEmail = String(data.email || "").trim();
        if (pName) name = pName;
        if (pEmail) email = pEmail;
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
    return this.sb.auth.signInWithOtp({
      email,
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
