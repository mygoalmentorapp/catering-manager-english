import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { trpc } from "./trpc";

interface User {
  openId: string;
  email?: string;
  role?: string;
  name?: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  isAdmin: false,
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setUser(null);
      window.location.reload();
    },
  });

  useEffect(() => {
    if (meQuery.data !== undefined) {
      setUser(meQuery.data as User | null);
      setIsLoading(false);
    }
    if (meQuery.error) {
      setUser(null);
      setIsLoading(false);
    }
  }, [meQuery.data, meQuery.error]);

  const isAdmin = user?.role === "admin";

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAdmin,
        logout: () => logoutMutation.mutate(),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
