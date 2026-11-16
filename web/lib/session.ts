"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SessionUser } from "@summertime/ledger";
import { api, ApiError } from "./api";

/** The signed-in user, or null when there is no session. */
export function useSession() {
  return useQuery<SessionUser | null>({
    queryKey: ["session"],
    queryFn: async () => {
      try {
        return await api.get<SessionUser>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 30_000,
  });
}

export function homeFor(role: SessionUser["role"]): string {
  if (role === "forwarder") return "/forwarder";
  if (role === "importer") return "/importer";
  return "/operations";
}

export function useSignOut() {
  const qc = useQueryClient();
  return async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      qc.clear();
      window.location.assign("/");
    }
  };
}
