import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          New to Sendcoop?{" "}
          <Link href="/signup" className="font-medium underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthCard>
  );
}
