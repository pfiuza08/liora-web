// =============================================================
// 🔐 LIORA — Premium Modal (Upgrade)
// Versão: v1.2 (user-changed + dashboard-refresh centralizados)
// Abre com:
// - liora:premium-bloqueado   (detail opcional)
// - liora:login-required      (detail opcional)
// =============================================================

export const premium = {
  ctx: null,

  init(ctx) {
    this.ctx = ctx;
    this.ensureModal();

    window.addEventListener("liora:premium-bloqueado", (ev) => this.open("premium", ev?.detail));
    window.addEventListener("liora:login-required", (ev) => this.open("login", ev?.detail));

    document.addEventListener("click", (ev) => {
      const modal = document.getElementById("liora-premium");
      if (!modal || modal.classList.contains("hidden")) return;

      const a = ev.target.closest("[data-premium-action]");
      if (!a) return;

      const act = a.getAttribute("data-premium-action");

      if (act === "close") return this.close();

      if (act === "login") {
        this.close();
        window.dispatchEvent(new Event("liora:open-login"));
        return;
      }

      if (act === "goPlans") {
        this.close();
        window.dispatchEvent(new Event("liora:open-plans"));
        return;
      }

      // DEV: ativar premium no mock (somente em dev mode)
      if (act === "devPremium" && this.isDevMode()) {
        this.setPremium(true); // ✅ já dispara user-changed + dashboard-refresh
        this.close();
        this.toast("✅ Premium ativado (mock).");
        return;
      }
    });

    console.log("🔐 premium.js iniciado");
  },

  isDevMode() {
    try {
      const url = new URL(window.location.href);
      return url.searchParams.get("dev") === "1";
    } catch {
      return false;
    }
  },

  getUser() {
    try {
      const u =
        this.ctx?.store?.get?.("user") ||
        this.ctx?.store?.get?.("liora_user") ||
        null;
      return u && typeof u === "object" ? u : null;
    } catch {
      return null;
    }
  },

  // ✅ CENTRAL: toda mudança no status do usuário notifica o app
  setPremium(on) {
    try {
      const u = this.getUser() || { name: "Usuário", premium: false };
      u.premium = !!on;
      this.ctx?.store?.set?.("user", u);

      window.dispatchEvent(new Event("liora:user-changed"));
      window.dispatchEvent(new Event("liora:dashboard-refresh"));
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
          <div class="liora-modal-note muted" id="liora-premium-note">
            Você pode começar no gratuito e evoluir quando quiser.
          </div>

          <ul class="liora-modal-list">
            <li><b>Insights automáticos</b> (melhor banca, próximo foco)</li>
            <li><b>Detalhes por banca</b> e ranking</li>
            <li><b>Histórico completo</b> + recomendações</li>
          </ul>
        </div>

        <div class="liora-modal-actions" id="liora-premium-actions">
          <button class="btn-secondary" data-premium-action="goPlans">Ver planos</button>
          <button class="btn-primary" data-premium-action="devPremium" id="liora-dev-premium">Ativar Premium (mock)</button>
          <button class="btn-primary hidden" data-premium-action="login" id="liora-login-btn">Entrar</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
  },

  open(kind = "premium", detail = null) {
    const modal = document.getElementById("liora-premium");
    if (!modal) return;

    const title = modal.querySelector("#liora-premium-title");
    const sub = modal.querySelector("#liora-premium-sub");
    const note = modal.querySelector("#liora-premium-note");
    const devBtn = modal.querySelector("#liora-dev-premium");
    const loginBtn = modal.querySelector("#liora-login-btn");

    // dev button só em dev mode
    if (devBtn) devBtn.classList.toggle("hidden", !this.isDevMode());

    if (kind === "login") {
      if (title) title.textContent = "Entrar para continuar";
      if (sub) sub.textContent = "Faça login para acessar este recurso.";
      if (note) note.textContent = "Seu progresso fica salvo e sincronizado quando você estiver logada.";

      if (loginBtn) loginBtn.classList.remove("hidden");
    } else {
      if (title) title.textContent = "Desbloquear Premium";
      if (sub) sub.textContent = "Mais métricas, insights e recomendações.";
      if (note) {
        const used = detail?.used;
        const limit = detail?.limit;
        if (typeof used === "number" && typeof limit === "number") {
          note.textContent = `Limite do plano gratuito: ${used}/${limit} simulados hoje.`;
        } else {
          note.textContent = "Você pode começar no gratuito e evoluir quando quiser.";
        }
      }

      if (loginBtn) loginBtn.classList.add("hidden");
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
