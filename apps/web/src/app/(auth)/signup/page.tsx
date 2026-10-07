import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Email marketing measured in revenue."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium underline">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
