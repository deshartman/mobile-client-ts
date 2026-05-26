"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearSession, loadSession, saveSession, type Session } from "@/lib/client/session";

interface SessionContextValue {
  session: Session | null;
  ready: boolean;
  setSession: (s: Session) => void;
  clear: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessionState(loadSession());
    setReady(true);
  }, []);

  const setSession = useCallback((s: Session) => {
    saveSession(s);
    setSessionState(s);
  }, []);

  const clear = useCallback(() => {
    clearSession();
    setSessionState(null);
  }, []);

  return (
    <SessionContext.Provider value={{ session, ready, setSession, clear }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
