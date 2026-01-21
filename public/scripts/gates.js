export const gates = {
  isPremium(store) {
    const user = store.get("user");
    return !!user?.premium;
  },

  canUseTutor(store) {
    // IA tutora = premium (vamos implementar depois)
    return this.isPremium(store);
  },

  canUseAdvancedTheme(store) {
    // Tema claro NÃO é premium (sua decisão final)
    return true;
  },

  canUseSimulados(store) {
    // simulados no Projeto Zero: em breve
    return true;
  }
};
