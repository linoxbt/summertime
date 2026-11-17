"use client";

import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { PRIVY_APP_ID, privyEnabled, registerPrivyLogout } from "@/lib/privy";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000,
            refetchOnWindowFocus: true,
            // Never retry auth or validation failures; retry transient ones briefly.
            // A deployment with no backend answers BACKEND_OFFLINE: show that at once.
            retry: (count, err) =>
              !(err instanceof ApiError && ((err.status >= 400 && err.status < 500) || err.code === "BACKEND_OFFLINE")) && count < 2,
          },
          mutations: { retry: false },
        },
      }),
  );
  const app = <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  if (!privyEnabled) return app;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "light", accentColor: "#0b0a09", landingHeader: "Sign in to Summertime", showWalletLoginFirst: false },
        // Summertime holds no browser wallets: parties are hosted on the ledger (pilot mode).
        embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
      }}
    >
      <PrivyLogoutBridge />
      {app}
    </PrivyProvider>
  );
}

function PrivyLogoutBridge() {
  const { logout } = usePrivy();
  useEffect(() => {
    registerPrivyLogout(logout);
    return () => registerPrivyLogout(null);
  }, [logout]);
  return null;
}
