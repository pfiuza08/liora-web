// /app/scripts/thanks.js
// =============================================================
// ✅ LIORA — THANKS (pós-compra Hotmart)
// - Envia magic link
// - Atualiza premium via /api/consume-pending (server-side)
// =============================================================
export const thanks = {
  ctx: null,

  init(ctx) {
    this.ctx = ctx;

    const sendBtn = document.getElementById("thanks-sendlink");
    const refreshBtn = document.getElementById("thanks-refresh");

    sendBtn?.addEventListener("click", () => this.sendLink());
    refreshBtn?.addEventListener("click", () => this.refreshAccess());

    // auto preencher se já tiver user no store
    try {
      const u = this.ctx?.store?.get?.("user");
      const email = (u?.email || "").trim().toLowerCase();
      const inp = document.getElementById("thanks-email");
      if (inp && email) inp.value = email;
    } catch {}

    // quando abrir a tela, tenta atualizar (sem spam)
    window.addEventListener("liora:open-thanks", () => {
      this._setStatus("Se você já entrou, clique em “Atualizar acesso”.");
    });
  },

  _setStatus(msg) {
    const el = document.getElementById("thanks-status");
    if (el) el.textContent = msg || "";
  },

  async sendLink() {
    const email = (document.getElementById("thanks-email")?.value || "").trim().toLowerCase();
    if (!email) return this._setStatus("Digite seu e-mail.");

    this._setStatus("Enviando link…");

    const auth = this.ctx?.auth || window.lioraAuth || null;
    if (!auth?.sendMagicLink) {
      this._setStatus("Auth não inicializado.");
      return;
    }

    const { error } = await auth.sendMagicLink(email);
    if (error) {
      this._setStatus(error.message || "Falha ao enviar link.");
      return;
    }

    this._setStatus("Link enviado! Abra seu e-mail e depois volte aqui para “Atualizar acesso”.");
  },

  async refreshAccess() {
    const ctx = this.ctx;
    const auth = ctx?.auth || window.lioraAuth || null;

    if (!auth?.sb || !auth?.user?.id) {
      this._setStatus("Você precisa entrar primeiro (use “Enviar link”).");
      return;
    }

    this._setStatus("Atualizando acesso…");

    try {
      // chama API server-side para consumir pending
      const accessToken = auth?.session?.access_token || null;
      const email = (auth?.user?.email || "").trim().toLowerCase();

      if (!accessToken || !email) {
        this._setStatus("Sessão inválida. Faça login novamente.");
        return;
      }

      const resp = await fetch("/api/consume-pending", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ email })
      });

      const data = await resp.json().catch(() => ({}));

      // depois sempre atualiza profiles -> store
      await auth.refreshProfile(ctx);

      const u = ctx?.store?.get?.("user") || null;
      if (u?.premium) {
        this._setStatus("✅ Premium ativado! Pode usar tudo liberado.");
        // opcional: mandar pro app principal
        // location.hash = "#home";
        return;
      }

      // ainda não virou premium
      const hint =
        data?.pending_found === false
          ? "Ainda não achei a compra nesse e-mail. Confirme se é o mesmo e-mail da Hotmart."
          : "Ainda não liberou. Às vezes o webhook demora alguns minutos. Tente de novo em 1–2 min.";

      this._setStatus(`⚠️ Ainda sem Premium. ${hint}`);
    } catch (e) {
      this._setStatus("Erro ao atualizar acesso. Tente novamente.");
      console.warn(e);
    }
  }
};
