// Privy sign-in is on when NEXT_PUBLIC_PRIVY_APP_ID is set at build time. Without it the app
// keeps its own email/password sign-in.

export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
export const privyEnabled = PRIVY_APP_ID.length > 0;

// Sign-out must also end the Privy session, or visiting /login would sign straight back in.
// The Privy provider registers its logout here; useSignOut calls it.
let privyLogout: (() => Promise<void>) | null = null;

export function registerPrivyLogout(fn: (() => Promise<void>) | null): void {
  privyLogout = fn;
}

export async function privySignOut(): Promise<void> {
  try {
    await privyLogout?.();
  } catch {
    /* already signed out of Privy */
  }
}
