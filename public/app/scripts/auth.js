// /app/scripts/auth.js
// =============================================================
// 🔐 LIORA — AUTH (Supabase Magic Link) v1.3
// (profiles + premium + pending + throttle + logs)
// Exporta: auth
// =============================================================
export const auth = {
  sb: null,
  session: null,
  user: null,

  // throttle local (evita martelar e cair em rate limit)
  THROTTLE_MS: 2 * 60 * 1000, // 2 min

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

  /* -----------------------------
     Helpers throttle
  ----------------------------- */
  _kThrottle(email) {
    return `liora:magic_throttle:${String(email || "").trim().toLowerCase()}`;
  },

  _readThrottle(email) {
    try {
      const raw = localStorage.getItem(this._kThrottle(email));
      const v = raw ? JSON.parse(raw) : null;
      return v && typeof v === "object" ? v : null;
    } catch {
      return null;
    }
  },

  _writeThrottle(email, meta) {
    try {
      localStorage.setItem(this._kThrottle(email), JSON.stringify(meta || {}));
    } catch {}
  },

  _clearThrottle(email) {
    try {
      localStorage.removeItem(this._kThrottle(email));
    } catch {}
  },

  _msLeftThrottle(email) {
    const t = this._readThrottle(email);
    if (!t?.at) return 0;
    const left = (t.at + this.THROTTLE_MS) - Date.now();
    return left > 0 ? left : 0;
  },

  _fmtMs(ms) {
    const s = Math.ceil(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  },

  /* ---------------------------------------------------------
     ✅ Consome premium pendente (compra antes do login)
     - procura em premium_pending por email
     - se premium=true, aplica em profiles (id = auth user id)
     - remove o pending
  --------------------------------------------------------- */
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

    const fallbackEmail = (this.user?.email || "").trim().toLowerCase();

    // ---------------------------------------------------------
    // ✅ Se houver compra antes do login, promove pending -> profiles
    // ---------------------------------------------------------
    if (fallbackEmail) {
      const pend = await this._consumePendingPremium(fallbackEmail);
      if (pend?.consumed) console.log("✅ Premium pendente aplicado (Hotmart → profiles).");
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
      }
    } catch {}

    ctx?.store?.set?.("user", {
      uid: this.user.id,
      name,
      email,
      premium
    });

    window.dispatchEvent(new Event("liora:user-changed"));
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  },

  /* ---------------------------------------------------------
     ✉️ Magic Link (com throttle + logs + mensagens úteis)
  --------------------------------------------------------- */
  async sendMagicLink(email) {
    const sb = this.sb;
    const e = String(email || "").trim().toLowerCase();

    if (!sb) {
      return { data: null, error: { message: "Supabase não inicializado." } };
    }

    if (!e || !e.includes("@")) {
      return { data: null, error: { message: "Digite um e-mail válido." } };
    }

    // throttle local
    const left = this._msLeftThrottle(e);
    if (left > 0) {
      return {
        data: null,
        error: {
          message: `Aguarde ${this._fmtMs(left)} para pedir outro link (evita bloqueio).`
        }
      };
    }

    // registra tentativa local imediatamente (evita duplo clique)
    const stamp = { at: Date.now(), tries: (this._readThrottle(e)?.tries || 0) + 1 };
    this._writeThrottle(e, stamp);
    console.log("🔐 magic link attempt", { email: e, ...stamp });

    const { data, error } = await sb.auth.signInWithOtp({
      email: e,
      options: {
        // precisa estar permitido em Auth → URL Configuration → Redirect URLs
        emailRedirectTo: location.origin + "/app/"
      }
    });

    // log completo pra diagnóstico
    console.log("🔐 magic link result", { email: e, data, error });

    // se deu erro, mantém throttle por um tempo (pra não martelar)
    if (error) {
      // se for rate limit, aumenta um pouco o throttle local
      const msg = String(error.message || "").toLowerCase();
      if (msg.includes("rate limit")) {
        // estica para 5 min (somente local)
        this._writeThrottle(e, { at: Date.now(), tries: stamp.tries, forcedMs: 5 * 60 * 1000 });
      }
      return { data, error };
    }

    return { data, error: null };
  },

  async signOut() {
    return this.sb.auth.signOut();
  },

  isLogged() {
    return !!this.user?.id;
  }
};
