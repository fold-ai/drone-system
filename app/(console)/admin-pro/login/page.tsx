"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Brand } from "@/components/ui/Brand";

/**
 * Sign-in.
 *
 * The only page under /admin-pro that is reachable without a session. It says
 * nothing about what is behind it and reports one failure message for every
 * kind of failure, so it cannot be used to find out which accounts exist.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/admin-pro";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Sign-in failed.");
        setBusy(false);
        return;
      }
      // Full navigation, so middleware sees the new cookie on the way in.
      window.location.assign(next.startsWith("/") ? next : "/admin-pro");
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
    void router;
  };

  return (
    <div className="flex h-full items-center justify-center px-6">
      <form onSubmit={submit} className="w-[320px] border border-rule bg-panel">
        <div className="flex items-center gap-3 rule-b px-4 py-3">
          <Brand product={null} />
          <span className="tracked text-[11px] font-semibold text-bright">Sign in</span>
        </div>

        <div className="space-y-3 px-4 py-4">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.1em] text-dim">
              Operator email
            </span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-[12px]"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-[0.1em] text-dim">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full text-[12px]"
            />
          </label>

          {error && (
            <p className="flex gap-1.5 border border-alert px-2 py-1.5 text-[11px] leading-snug text-alert">
              <span className="num shrink-0">!</span>
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="hit h-7 w-full border border-bright text-[11px] text-bright hover:bg-bright hover:text-void disabled:opacity-40"
          >
            {busy ? "checking" : "sign in"}
          </button>

          <p className="text-[10px] leading-snug text-dim">
            There is no self-service password reset. Ask an operator with database access to
            issue a new hash.
          </p>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
