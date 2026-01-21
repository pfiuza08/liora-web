export const ui = {
  loading(show, text = "Processando…") {
    const overlay = document.getElementById("ui-loading");
    const label = document.getElementById("ui-loading-text");
    if (!overlay) return;

    if (label) label.textContent = text;
    overlay.classList.toggle("hidden", !show);
  },

  error(msg = "Erro inesperado.") {
    const overlay = document.getElementById("ui-error");
    const label = document.getElementById("ui-error-text");
    const close = document.getElementById("ui-error-close");

    if (!overlay) {
      alert(msg);
      return;
    }

    if (label) label.textContent = msg;
    overlay.classList.remove("hidden");

    close?.addEventListener("click", () => {
      overlay.classList.add("hidden");
    }, { once: true });
  },

  toast(msg) {
    console.log("🟠 UI:", msg);
  }
};
