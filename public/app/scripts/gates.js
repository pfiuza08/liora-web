// =============================================================
// 🔒 LIORA — Gates (regras de acesso)
// Versão: v3.0 — login obrigatório + Free reduzido
// =============================================================

export const gates = {
  limits: {
    free_tema_per_day: 1,
    free_simulados_per_day: 1,
    free_simulado_max_questions: 5
  },

  _store(store) {
    return store || window.lioraStore || null;
  },

  getUser(store) {
    try {
      const u = this._store(store)?.get?.("user");
      return u && typeof u === "object" ? u : null;
    } catch {
      return null;
    }
  },

  isLogged(store) {
    const u = this.getUser(store);
    return !!(u && (u.name || u.uid || u.email));
  },

  isPremium(store) {
    const u = this.getUser(store);
    return !!u?.premium;
  },

  _todayISO() {
    return new Date().toISOString().slice(0, 10);
  },

  _usageGet(store) {
    const s = this._store(store);
    const today = this._todayISO();

    try {
      const raw = s?.get?.("usage:v1");
      if (!raw || typeof raw !== "object" || raw.day !== today) {
        return { day: today, tema: 0, pdf: 0, sim: 0, simulados: 0 };
      }

      return {
        day: today,
        tema: Number(raw.tema || 0),
        pdf: Number(raw.pdf || 0),
        sim: Number(raw.sim || raw.simulados || 0),
        simulados: Number(raw.simulados || raw.sim || 0)
      };
    } catch {
      return { day: today, tema: 0, pdf: 0, sim: 0, simulados: 0 };
    }
  },

  _loginGate(store) {
    if (this.isLogged(store)) return null;
    return {
      ok: false,
      reason: "login",
      msg: "Entre para usar as funcionalidades da Liora, inclusive no plano Free."
    };
  },

  canGenerateTemaPlan(store) {
    const login = this._loginGate(store);
    if (login) return login;
    if (this.isPremium(store)) return { ok: true, premium: true };

    const used = this._usageGet(store).tema;
    const limit = this.limits.free_tema_per_day;

    if (used >= limit) return { ok: false, reason: "limit", used, limit };
    return { ok: true, used, limit };
  },

  canGeneratePdfPlan(store) {
    const login = this._loginGate(store);
    if (login) return login;
    if (this.isPremium(store)) return { ok: true, premium: true };

    return {
      ok: false,
      reason: "premium",
      msg: "A geração de planos por PDF é um recurso Premium."
    };
  },

  canStartSimulado(store) {
    const login = this._loginGate(store);
    if (login) return login;
    if (this.isPremium(store)) return { ok: true, premium: true };

    const used = this._usageGet(store).sim;
    const limit = this.limits.free_simulados_per_day;

    if (used >= limit) return { ok: false, reason: "limit", used, limit };
    return {
      ok: true,
      used,
      limit,
      maxQuestions: this.limits.free_simulado_max_questions
    };
  },

  canRunSimulados(store) {
    return this.canStartSimulado(store);
  },

  canAprofundar(store) {
    const login = this._loginGate(store);
    if (login) return login;
    if (this.isPremium(store)) return { ok: true, premium: true };

    return {
      ok: false,
      reason: "premium",
      msg: "A função Aprofundar é um recurso Premium."
    };
  },

  canUseAprofundar(store) {
    return this.canAprofundar(store);
  },

  canGeneratePlan(store, options = {}) {
    const source = String(options?.source || "tema").toLowerCase();

    if (source === "pdf") return this.canGeneratePdfPlan(store);
    if (source === "simulados" || source === "simulado") return this.canStartSimulado(store);
    if (source === "aprofundar") return this.canAprofundar(store);
    return this.canGenerateTemaPlan(store);
  },

  canOpenDashboard(store) {
    const login = this._loginGate(store);
    return login || { ok: true };
  },

  canUseDashboardPremiumBlocks(store) {
    return this.isPremium(store);
  },

  canUseTutor(store) {
    return this.isPremium(store);
  },

  canUseAdvancedTheme(store) {
    return this.isLogged(store);
  },

  getSimuladoMaxQuestions(store) {
    return this.isPremium(store) ? 30 : this.limits.free_simulado_max_questions;
  }
};

try {
  window.lioraGates = gates;
} catch {}
