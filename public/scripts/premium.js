// =============================================================
// 🔐 LIORA — Premium Modal (Upgrade)
// Versão: v1.0
//
// Mostra modal quando:
// - liora:premium-bloqueado
// - liora:login-required
//
// Usa user no store: { name, premium }
// =============================================================

export const premium = {
  ctx: null,

  init(ctx) {
    this.ctx = ctx;
    this.ensureModal();

    window.addEventListener("liora:premium-bloqueado", () => this.open("premium"));
    window.addEventListener("liora:login-required", () => this.open("login"));

    // close actions
    document.addEventListener("click", (ev) => {
      const modal = document.getElementById("liora-premium");
      if (!modal || modal.classList.contains("hidden")) return;

      const a = ev.target.closest("[data-premium-action]");
      if (!a) return;

      const act = a.getAttribute("data-premium-action");
      if (act === "close") return this.close();

      if (act === "goPlans") {
        // aqui você troca por sua URL real de checkout/planos
        this.toast("🧡 Em breve: página de planos/checkout.");
        return;
      }

      // DEV: ativar premium no mock
      if (act === "devPremium") {
        this.setPremium(true);
        this.close();
        this.toast("✅ Premium ativado (mock).");
        window.dispatchEvent(new Event("liora:user-changed"));
        window.dispatchEvent(new Event("liora:dashboard-refresh"));
        return;
      }
    });

    console.log("🔐 premium.js iniciado");
  },

  getUser() {
    try {
      const u = this.ctx?.store?.get?.("user") || null;
      return u && typeof u === "object" ? u : null;
    } catch {
      return null;
    }
  },

  setPremium(on) {
    try {
      const u = this.getUser() || { name: "Usuário", premium: false };
      u.premium = !!on;
      this.ctx?.store?.set?.("user", u);
    } catch {}
  },

  ensureModal() {
    if (document.getElementById("liora-premium")) return;

    const el = document.createElement("div");
    el.id = "liora-premium";
    el.className = "liora-modal hidden";
    el.innerHTML = `
      <div class="liora-modal-backdrop" data-premium-action="close"></div>
      <div class="liora-modal-card">
        <div class="liora-modal-head">
          <div>
            <div class="liora-modal-title" id="liora-premium-title">Desbloquear Premium</div>
            <div class="liora-modal-sub muted" id="liora-premium-sub">Mais métricas, insights e recomendações.</div>
          </div>
          <button class="btn-secondary" data-premium-action="close">Fechar</button>
        </div>

        <div class="liora-modal-body">
          <ul class="liora-modal-list">
            <li>Trava 2: <b>Insights automáticos</b> (melhor banca, próximo foco)</li>
            <li>Trava 3: <b>Detalhes por banca</b> e ranking</li>
            <li>Trava 4: <b>Histórico completo</b> + recomendações</li>
          </ul>

          <div class="liora-modal-note muted">
            Você pode começar no gratuito e evoluir quando quiser.
          </div>
        </div>

        <div class="liora-modal-actions">
          <button class="btn-secondary" data-premium-action="goPlans">Ver planos</button>
          <button class="btn-primary" data-premium-action="devPremium">Ativar Premium (mock)</button>
        </div>
      </div>
    `;

    document.body.appendChild(el);
  },

  open(kind = "premium") {
    const modal = document.getElementById("liora-premium");
    if (!modal) return;

    const title = modal.querySelector("#liora-premium-title");
    const sub = modal.querySelector("#liora-premium-sub");

    if (kind === "login") {
      if (title) title.textContent = "Entrar para continuar";
      if (sub) sub.textContent = "Faça login para acessar este recurso.";
    } else {
      if (title) title.textContent = "Desbloquear Premium";
      if (sub) sub.textContent = "Mais métricas, insights e recomendações.";
    }

    modal.classList.remove("hidden");
    document.body.classList.add("liora-modal-open");
  },

  close() {
    const modal = document.getElementById("liora-premium");
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.classList.remove("liora-modal-open");
  },

  toast(msg) {
    try {
      this.ctx?.ui?.toast?.(msg);
    } catch {}
    console.log("🔔", msg);
  }
};
