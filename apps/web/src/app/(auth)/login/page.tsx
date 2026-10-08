import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { safeNext } from "@/lib/safe-next";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const to = safeNext((await searchParams).next);
  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          New to Sendcoop?{" "}
          <Link
            href={to ? `/signup?next=${encodeURIComponent(to)}` : "/signup"}
            className="font-medium underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm next={to} />
    </AuthCard>
  );
}
