export const router = {
  screens: ["home", "tema", "pdf", "simulados", "dashboard"],

  init() {
    // nada por enquanto
  },

  go(route) {
    if (!this.screens.includes(route)) route = "home";

    this.screens.forEach((r) => {
      const el = document.getElementById(`screen-${r}`);
      if (!el) return;
      el.classList.toggle("active", r === route);
    });

    console.log("🧭 Router →", route);

    // ✅ HOOKS POR ROTA (telas que precisam "renderizar" ao abrir)
    // Usa requestAnimationFrame para garantir que a troca de screen já aconteceu no DOM
    if (route === "dashboard") {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("liora:open-dashboard"));
      });
    }

    if (route === "simulados") {
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("liora:open-simulados"));
      });
    }
  }
};
