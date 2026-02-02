// =============================================================
// 🔒 LIORA — Gates (regras de acesso)
// Versão: v2.0
// =============================================================

export const gates = {
  // -----------------------------
  // USER
  // -----------------------------
  getUser(store) {
    try {
      const u = store?.get?.("user");
      return u && typeof u === "object" ? u : null;
    } catch {
      return null;
    }
  },

  isLogged(store) {
    const u = this.getUser(store);
    // considera logado se tiver name OU uid/email (se você usar isso depois)
    return !!(u && (u.name || u.uid || u.email));
  },

  isPremium(store) {
    const u = this.getUser(store);
    return !!u?.premium;
  },

  // -----------------------------
  // STATS (para limite free)
  // -----------------------------
  _todayISO(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },

  _statsGet() {
    const key = "liora_stats:v1";
    try {
      const raw = localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : {};
      return Array.isArray(data.attempts) ? data.attempts : [];
    } catch {
      return [];
    }
  },

  getSimuladosHojeCount() {
    const today = this._todayISO();
    const attempts = this._statsGet();
    return attempts.filter((a) => a?.date === today).length;
  },

  // -----------------------------
  // LIMITES (free)
  // -----------------------------
  // ajuste aqui sem medo
  limits: {
    free_simulados_per_day: 3
  },

  // -----------------------------
  // FEATURES / TELAS
  // -----------------------------
  // Dashboard MVP: você decidiu "Trava 2" como premium?
  // Pelo seu modal, Trava 2,3,4 são premium features do dashboard.
  // Então: entrar para ver dashboard (Trava 2 = login). E partes premium (Trava 2/3/4 no seu texto) exigem premium.
  // Sugestão prática:
  // - Dashboard básico: login
  // - Insights/Detalhes/Histórico completo: premium
  canOpenDashboard(store) {
    return this.isLogged(store); // login obrigatório
  },

  canUseDashboardPremiumBlocks(store) {
    return this.isPremium(store);
  },

  // Simulados: por enquanto liberado, mas com limite no free
  canStartSimulado(store) {
    // se você quiser exigir login para salvar histórico, faça:
    // if (!this.isLogged(store)) return { ok:false, reason:"login" };

    // limite free
    if (this.isPremium(store)) return { ok: true };

    const used = this.getSimuladosHojeCount();
    const limit = this.limits.free_simulados_per_day;

    if (used >= limit) {
      return { ok: false, reason: "limit", used, limit };
    }

    return { ok: true, used, limit };
  },

  // Tutor (quando existir)
  canUseTutor(store) {
    return this.isPremium(store);
  },

  // Tema avançado (você disse que NÃO é premium)
  canUseAdvancedTheme(store) {
    return true;
  }
};
// -------------------------------------------------------------
// 🌐 Expor gates global (para módulos sem import)
// -------------------------------------------------------------
try {
  window.lioraGates = gates;
} catch {}

