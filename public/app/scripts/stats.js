// =============================================================
// 📈 LIORA — STATS (MVP local)
// Versão: v1.0
//
// Salva em localStorage: "liora_stats:v1"
// - attempts: simulados (questões e acertos)
// - sessions: sessões de estudo (Tema/PDF)
//
// Escuta eventos canônicos:
// - liora:study-session-done  (detail: { tema, sessao, timeSec, source })
// Opcional via API:
// - window.lioraStats.addAttempt(detail)
//
// Dispara:
// - liora:stats-changed
// - liora:dashboard-refresh
// =============================================================

export const stats = {
  ctx: null,
  KEY: "liora_stats:v1",

  init(ctx) {
    this.ctx = ctx;

    // expose global para features sem import (ex: simulados)
    window.lioraStats = this;

    // sessão concluída (Tema/PDF)
    window.addEventListener("liora:study-session-done", (ev) => {
      const d = ev?.detail || null;
      if (!d) return;
      this.addSession(d);
    });

    console.log("📈 stats.js iniciado (MVP)");
  },

  // -----------------------------
  // storage helpers
  // -----------------------------
  _read() {
    try {
      const raw = localStorage.getItem(this.KEY);
      const data = raw ? JSON.parse(raw) : {};
      return {
        attempts: Array.isArray(data.attempts) ? data.attempts : [],
        sessions: Array.isArray(data.sessions) ? data.sessions : [],
        meta: data.meta && typeof data.meta === "object" ? data.meta : {}
      };
    } catch {
      return { attempts: [], sessions: [], meta: {} };
    }
  },

  _write(next) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(next));
    } catch (e) {
      console.warn("⚠️ Falha ao salvar stats", e);
    }
  },

  _today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },

  _emitChanged() {
    window.dispatchEvent(new CustomEvent("liora:stats-changed"));
    window.dispatchEvent(new Event("liora:dashboard-refresh"));
  },

  // -----------------------------
  // public API
  // -----------------------------

  // Sessões (Tema/PDF)
  addSession(detail) {
    const tema = String(detail?.tema || "—").trim() || "—";
    const sessao = String(detail?.sessao || "Sessão").trim() || "Sessão";
    const timeSec = Math.max(0, Number(detail?.timeSec || 0));
    const source = String(detail?.source || "study");

    const now = Date.now();
    const row = {
      ts: now,
      date: this._today(),
      tema,
      sessao,
      timeSec,
      source
    };

    const data = this._read();
    data.sessions.unshift(row);
    data.sessions = data.sessions.slice(0, 500); // guarda bastante, mas sem infinito
    this._write(data);

    this._emitChanged();
    return row;
  },

  // Simulados (OBJ/DISC)
  // Esperado: { banca, tema, dificuldade, mode, total, correct, timeSec }
  addAttempt(detail) {
    const banca = String(detail?.banca || "—");
    const tema = String(detail?.tema || "Geral");
    const dificuldade = String(detail?.dificuldade || "misturado");
    const mode = String(detail?.mode || "obj");

    const total = Math.max(0, Number(detail?.total || 0));
    const correct = Math.max(0, Number(detail?.correct || 0));
    const timeSec = Math.max(0, Number(detail?.timeSec || 0));

    const now = Date.now();
    const row = {
      ts: now,
      date: this._today(),
      banca,
      tema,
      dificuldade,
      mode,
      total,
      correct,
      timeSec
    };

    const data = this._read();
    data.attempts.unshift(row);
    data.attempts = data.attempts.slice(0, 500);
    this._write(data);

    this._emitChanged();
    return row;
  }
};
