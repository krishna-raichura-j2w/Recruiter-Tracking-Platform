import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { loginApi } from "@/apiService/api";
import { can as checkPermission, type Module, type Action } from "./permissions";

interface User {
  email: string;
  name: string;
  role: string;
  id?: number;
}

interface AuthCtx {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  loginDemo: () => void;
  logout: () => void;
  updateUserState: (updates: Partial<User>) => void;
  ready: boolean;
  /** Returns true if the current user's role permits the given module + action. */
  can: (module: Module, action: Action) => boolean;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "j2w_user";
const TOKEN_KEY = "j2w_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
      const storedId = typeof window !== "undefined" ? localStorage.getItem("user_id") : null;
      if (raw && token) {
        const u = JSON.parse(raw);
        if (!u.id && storedId) {
          u.id = Number(storedId);
        }
        setUser(u);
      } else if (typeof window !== "undefined") {
        localStorage.removeItem(KEY);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem("user_id");
        sessionStorage.removeItem("user_id");
      }
    } catch {}
    setReady(true);
  }, []);

  const login = async (email: string, password: string): Promise<User> => {
    const res = await loginApi(email, password);
    if (!res.is_hrbp_member) {
      throw new Error("Access denied. You do not have access to the HRBP system.");
    }
    const u: User = {
      email: res.email,
      name: res.name,
      role: res.role,
      id: res.user_id,
    };
    localStorage.setItem(KEY, JSON.stringify(u));
    localStorage.setItem(TOKEN_KEY, res.access_token);
    localStorage.setItem("user_id", String(res.user_id));
    sessionStorage.setItem("user_id", String(res.user_id));
    setUser(u);
    return u;
  };
  const loginDemo = () => {
    const u: User = { email: "demo@j2w.io", name: "Priya Mehta", role: "Senior HRBP", id: 6 };
    localStorage.setItem(KEY, JSON.stringify(u));
    localStorage.setItem(TOKEN_KEY, "demo-token-12345");
    localStorage.setItem("user_id", "6");
    sessionStorage.setItem("user_id", "6");
    setUser(u);
  };
  const logout = () => {
    localStorage.removeItem(KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem("user_id");
    sessionStorage.removeItem("user_id");
    setUser(null);
  };
  const updateUserState = (updates: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      localStorage.setItem(KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const can = useCallback(
    (module: Module, action: Action) => checkPermission(user?.role, module, action),
    [user?.role],
  );

  return (
    <Ctx.Provider value={{ user, login, loginDemo, logout, updateUserState, ready, can }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}

export function isAuthed() {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("j2w_token");
}
