"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    setPending(true);
    setError(null);

    const { error } = await authClient.signIn.email({
      email,
      password: String(form.get("password")),
    });

    if (error) {
      setPending(false);
      if (error.status === 403) {
        // Unverified email: send them to the "check your inbox" page.
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(
        error.status === 401 ? "Wrong email or password." : (error.message ?? "Couldn't log in."),
      );
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormError message={error} />
      <Field label="Email" name="email" type="email" required autoComplete="email" />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="current-password"
      />
      <SubmitButton pending={pending}>Log in</SubmitButton>
    </form>
  );
}
