// /app/scripts/auth.js
// =============================================================
// 🔐 LIORA — AUTH (Supabase Magic Link + Google OAuth) v1.5
// (profiles + premium + pending + throttle robusto + logs + refreshProfile)
// Exporta: auth
// =============================================================
export const auth = {
  sb: null,
  session: null,
  user: null,

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

    // expõe para o resto do app se quiser usar sb direto
    ctx.supabase = this.sb;

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
     Google OAuth
  ----------------------------- */
  async signInWithGoogle(redirectPath = "/app/") {
    const sb = this.sb;
    if (!sb) return { data: null, error: { message: "Supabase não inicializado." } };

    const redirectTo = (location.origin || "").replace(/\/$/, "") + redirectPath;

    const { data, error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo }
    });

    return { data, error };
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

  _throttleWindowMs(email) {
    const t = this._readThrottle(email);
    const forced = Number(t?.forcedMs);
    if (!Number.isNaN(forced) && forced > 0) return forced;
    return this.THROTTLE_MS;
  },

  _msLeftThrottle(email) {
    const t = this._readThrottle(email);
    if (!t?.at) return 0;

    const windowMs = this._throttleWindowMs(email);
    const left = (t.at + windowMs) - Date.now();
    return left > 0 ? left : 0;
  },

  _fmtMs(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m <= 0) return `${r}s`;
    return `${m}:${String(r).padStart(2, "0")}`;
  },

  _isRateLimitError(error) {
    const msg = String(error?.message || "").toLowerCase();
    const code = String(error?.code || "").toLowerCase();
    const status = String(error?.status || "");
    return (
      msg.includes("rate limit") ||
      msg.includes("too many") ||
      msg.includes("exceeded") ||
      code.includes("rate") ||
      status.includes("429")
    );
  },

  /* ---------------------------------------------------------
     ✅ Consome premium pendente (compra antes do login)
  --------------------------------------------------------- */
  async _consumePendingPremium(email) {
    try {
      const sb = this.sb;
      const u = this.user;

      const e = String(email || "").trim().toLowerCase();
      if (!sb || !u?.id || !e) return { consumed: false };

      const { data: pending, error: e1 } = await sb
        .from("premium_pending")
        .select("email, premium, plan, last_event, payload_id, updated_at")
        .eq("email", e)
        .maybeSingle();

      if (e1) {
        console.warn("⚠️ pending select error:", e1);
        return { consumed: false, error: e1.message };
      }

      if (!pending || pending.premium !== true) return { consumed: false };

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

    // Se houver compra antes do login, consome pendência via API (server-side)
    try {
      const accessToken = this.session?.access_token || "";
      if (accessToken) {
        const resp = await fetch("/api/consume-pending", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        const out = await resp.json().catch(() => null);

        if (resp.ok && out?.consumed) {
          console.log("✅ Premium pendente aplicado (API → profiles).");
          await this.refreshProfile(ctx);
        }
      }
    } catch (e) {
      console.warn("⚠️ consume-pending falhou (segue o fluxo):", e);
    }

    // Busca profiles e espelha no store
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

    ctx?.store?.set?.("user", { uid: this.user.id, name, email, premium });

    window.dispatchEvent(new Event("liora:user-changed"));
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  },

  /* ---------------------------------------------------------
     ✉️ Magic Link
  --------------------------------------------------------- */
  async sendMagicLink(email) {
    const sb = this.sb;
    const e = String(email || "").trim().toLowerCase();

    if (!sb) return { data: null, error: { message: "Supabase não inicializado." } };
    if (!e || !e.includes("@")) return { data: null, error: { message: "Digite um e-mail válido." } };

    const left = this._msLeftThrottle(e);
    if (left > 0) {
      return {
        data: null,
        error: { message: `Aguarde ${this._fmtMs(left)} para reenviar o link.` }
      };
    }

    const prev = this._readThrottle(e);
    const stamp = {
      at: Date.now(),
      tries: (prev?.tries || 0) + 1,
      forcedMs: 0
    };
    this._writeThrottle(e, stamp);

    console.log("🔐 magic link attempt", { email: e, tries: stamp.tries, at: new Date(stamp.at).toISOString() });

    const { data, error } = await sb.auth.signInWithOtp({
      email: e,
      options: {
        // precisa estar permitido em Auth → URL Configuration → Redirect URLs
        emailRedirectTo: location.origin + "/app/"
      }
    });

    console.log("🔐 magic link result", { email: e, data, error });

    if (error) {
      const isRate = this._isRateLimitError(error);

      if (isRate) {
        this._writeThrottle(e, { at: Date.now(), tries: stamp.tries, forcedMs: 5 * 60 * 1000 });
        return {
          data,
          error: {
            ...error,
            message:
              "Limite de envios atingido. Aguarde 5 minutos e tente novamente (ou use outro e-mail/aba anônima para testes)."
          }
        };
      }

      this._writeThrottle(e, { at: Date.now(), tries: stamp.tries, forcedMs: 30 * 1000 });

      return {
        data,
        error: {
          ...error,
          message: error?.message || "Falha ao enviar link. Tente novamente."
        }
      };
    }

    this._writeThrottle(e, { at: Date.now(), tries: stamp.tries, forcedMs: 0 });

    return { data, error: null };
  },

  async signOut() {
    return this.sb.auth.signOut();
  },

  isLogged() {
    return !!this.user?.id;
  },

  /* ---------------------------------------------------------
     🔄 Rebusca profiles (premium) e atualiza store
  --------------------------------------------------------- */
  async refreshProfile(ctx) {
    try {
      if (!this.sb || !this.user?.id) return { ok: false, error: "not_logged" };

      const fallbackName =
        this.user?.user_metadata?.full_name ||
        this.user?.user_metadata?.name ||
        "";

      const fallbackEmail = this.user?.email || "";

      let premium = false;
      let name = fallbackName;
      let email = fallbackEmail;

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

      ctx?.store?.set?.("user", { uid: this.user.id, name, email, premium });
      window.dispatchEvent(new Event("liora:user-changed"));
      window.dispatchEvent(new Event("liora:dashboard-refresh"));

      return { ok: true, premium };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }
};
