"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** A read-only value with a copy button (links, embed code, DNS records). */
export function CopyField({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-2">
      {multiline ? (
        <Textarea
          aria-label={label}
          readOnly
          rows={8}
          value={value}
          className="font-mono text-xs"
        />
      ) : (
        <Input aria-label={label} readOnly value={value} className="font-mono text-xs" />
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
