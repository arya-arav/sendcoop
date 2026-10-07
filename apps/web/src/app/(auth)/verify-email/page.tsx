import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { ResendButton } from "./resend-button";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthCard
      title="Check your inbox"
      subtitle={
        email ? (
          <>
            We sent a confirmation link to <strong>{email}</strong>. Open it to finish signing up.
          </>
        ) : (
          "We sent you a confirmation link. Open it to finish signing up."
        )
      }
      footer={
        <Link href="/login" className="font-medium underline">
          Back to log in
        </Link>
      }
    >
      {email && <ResendButton email={email} />}
    </AuthCard>
  );
}
