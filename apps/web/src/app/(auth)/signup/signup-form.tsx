"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { authClient } from "@/lib/auth-client";

/** next: where to go once confirmed (a path here); email: prefilled (invitations). */
export function SignupForm({ next, email: invited }: { next?: string; email?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    setPending(true);
    setError(null);

    const { error } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email,
      password: String(form.get("password")),
      // Where the verification link sends them after confirming.
      callbackURL: next ?? "/",
    });

    if (error) {
      setPending(false);
      setError(error.message ?? "Couldn't create your account. Try again.");
      return;
    }
    router.push(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormError message={error} />
      <Field label="Your name" name="name" required autoComplete="name" maxLength={100} />
      <Field
        label="Work email"
        name="email"
        type="email"
        required
        autoComplete="email"
        defaultValue={invited}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
      />
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
