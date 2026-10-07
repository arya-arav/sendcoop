"use client";

import type { SegmentRules } from "@sendcoop/db/segments";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { previewSegmentAction, type SegmentPreview } from "./actions";

const numberFormat = new Intl.NumberFormat("en");

/** Live count for the rules being edited, refreshed shortly after each change. */
export function SegmentCount({
  slug,
  rules,
  valid,
  segmentId,
}: {
  slug: string;
  rules: SegmentRules;
  valid: boolean;
  /** Set once saved, to link to the matching subscribers. */
  segmentId: string | null;
}) {
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const key = valid ? JSON.stringify(rules) : null;

  useEffect(() => {
    if (!key) return;
    let current = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await previewSegmentAction(slug, JSON.parse(key));
      if (current) {
        setPreview(result);
        setLoading(false);
      }
    }, 400);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [slug, key]);

  const shown = key && preview?.ok ? preview : null;

  return (
    <Card size="sm" aria-busy={loading}>
      <CardHeader>
        <CardDescription>Matching subscribers</CardDescription>
        <CardTitle className="text-3xl tabular-nums" aria-live="polite">
          {shown ? numberFormat.format(shown.count) : "—"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {!key && <p className="text-muted-foreground">Complete the conditions to see a count.</p>}
        {shown && shown.sample.length > 0 && (
          <ul className="grid gap-1 text-muted-foreground">
            {shown.sample.map((s) => (
              <li key={s.id} className="truncate">
                {s.email}
              </li>
            ))}
          </ul>
        )}
        {shown && segmentId && shown.count > 0 && (
          <Link href={`/w/${slug}/contacts?segment=${segmentId}`} className="font-medium underline">
            View all in Contacts
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
