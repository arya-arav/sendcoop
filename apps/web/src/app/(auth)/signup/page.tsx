import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { safeNext } from "@/lib/safe-next";
import { SignupForm } from "./signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const { next, email } = await searchParams;
  const to = safeNext(next);
  return (
    <AuthCard
      title="Create your account"
      subtitle="Email marketing measured in revenue."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={to ? `/login?next=${encodeURIComponent(to)}` : "/login"}
            className="font-medium underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <SignupForm next={to} email={email?.slice(0, 200)} />
    </AuthCard>
  );
}
