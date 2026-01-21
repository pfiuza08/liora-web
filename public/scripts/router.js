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
  }
};
