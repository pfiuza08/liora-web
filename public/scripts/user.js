// ==========================================================
// 👤 LIORA — USER STATE (MVP local via store)
// Fonte única de verdade: store.get("user")
// ==========================================================

export const user = {
  key: "user",

  get(store) {
    try {
      return store?.get?.(this.key) || null;
    } catch {
      return null;
    }
  },

  set(store, u) {
    try {
      store?.set?.(this.key, u);
    } catch {}
  },

  clear(store) {
    try {
      store?.remove?.(this.key);
    } catch {}
  },

  isLogged(store) {
    return !!this.get(store);
  },

  isPremium(store) {
    return !!this.get(store)?.premium;
  },

  setPremium(store, premium) {
    const cur = this.get(store) || { name: "Usuário", premium: false };
    this.set(store, { ...cur, premium: !!premium });
  },

  installWindow(store) {
    // helpers pro console (QA)
    window.lioraUser = {
      get: () => this.get(store),
      isLogged: () => this.isLogged(store),
      isPremium: () => this.isPremium(store),
      loginMock: (name = "Patricia") => {
        this.set(store, { name, premium: false });
        window.dispatchEvent(new Event("liora:user-changed"));
      },
      logout: () => {
        this.clear(store);
        window.dispatchEvent(new Event("liora:user-changed"));
      },
      togglePremium: () => {
        this.setPremium(store, !this.isPremium(store));
        window.dispatchEvent(new Event("liora:user-changed"));
      }
    };
  }
};
