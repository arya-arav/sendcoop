"use client";

import { Plus } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createAutomationAction } from "./actions";

export function NewAutomationButton({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => startTransition(() => void createAutomationAction(slug))}
    >
      <Plus />
      New automation
    </Button>
  );
}
