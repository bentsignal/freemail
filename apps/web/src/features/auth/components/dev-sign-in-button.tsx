import { useState } from "react";

import { toast } from "@freemail/ui-web/toast";

import { env } from "~/env";

/**
 * The local website only: signs in as the development backend's fake owner
 * (services/convex/src/devSignIn.ts). Production has no such route.
 */
export function DevSignInButton() {
  if (env.VITE_NODE_ENV !== "development") return null;
  return <TestOwnerButton />;
}

function TestOwnerButton() {
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function signIn() {
    setIsSigningIn(true);
    const response = await fetch("/api/auth/dev/sign-in", {
      body: "{}",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (response.ok) {
      window.location.assign("/");
      return;
    }
    setIsSigningIn(false);
    toast.error("This backend has no test owner. Run scripts/web.sh up.");
  }

  return (
    <button
      className="bg-background border-border mt-3 flex h-12 w-full items-center justify-center rounded-[10px] border px-5 text-sm font-semibold disabled:opacity-55"
      disabled={isSigningIn}
      onClick={() => void signIn()}
      type="button"
    >
      Sign in as test owner
    </button>
  );
}
