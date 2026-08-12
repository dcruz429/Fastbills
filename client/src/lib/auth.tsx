import { createContext, useContext, ReactNode, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "./queryClient";
import type { User, LoginData } from "@shared/schema";

const AFK_TIMEOUT = 60 * 60 * 1000;

type AuthUser = User & { isImpersonating?: boolean; originalUserId?: number | null };

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  isImpersonating: boolean;
  login: (data: LoginData) => Promise<void>;
  logout: () => Promise<void>;
  impersonate: (userId: number) => Promise<void>;
  stopImpersonating: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginData) => {
      await apiRequest("POST", "/api/auth/login", data);
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.clear();
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("POST", `/api/admin/impersonate/${userId}`);
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const stopImpersonatingMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/impersonate/stop");
    },
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doLogout = useCallback(async () => {
    if (user) {
      await logoutMutation.mutateAsync();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        doLogout();
      }, AFK_TIMEOUT);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [user, doLogout]);

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        isImpersonating: !!(user?.isImpersonating),
        login: async (data) => {
          await loginMutation.mutateAsync(data);
        },
        logout: async () => {
          await logoutMutation.mutateAsync();
        },
        impersonate: async (userId: number) => {
          await impersonateMutation.mutateAsync(userId);
        },
        stopImpersonating: async () => {
          await stopImpersonatingMutation.mutateAsync();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
