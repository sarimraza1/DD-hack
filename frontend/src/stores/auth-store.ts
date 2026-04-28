import { create } from "zustand";
import { api } from "@/lib/api";

interface User {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,

  login: async (email, password) => {
    const { user, token } = await api.auth.login({ email, password });
    localStorage.setItem("ligma_token", token);
    localStorage.setItem("ligma_user", JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  register: async (email, name, password) => {
    const { user, token } = await api.auth.register({ email, name, password });
    localStorage.setItem("ligma_token", token);
    localStorage.setItem("ligma_user", JSON.stringify(user));
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem("ligma_token");
    localStorage.removeItem("ligma_user");
    set({ user: null, token: null, isAuthenticated: false });
  },

  hydrate: () => {
    const token = localStorage.getItem("ligma_token");
    const userJson = localStorage.getItem("ligma_user");
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson);
        set({ user, token, isAuthenticated: true });
      } catch {
        localStorage.removeItem("ligma_token");
        localStorage.removeItem("ligma_user");
      }
    }
  },
}));
