"use client";

import { Toaster } from "sonner";
import { SessionProvider } from "@/hooks/use-session";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SessionProvider>
      {children}
      <Toaster richColors position="top-center" />
    </SessionProvider>
  );
}
