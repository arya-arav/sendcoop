"use client";

import { Link2 } from "lucide-react";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listUtmcapCampaignsAction, type UtmcapCampaignOption } from "../../integrations/actions";

/**
 * Picks one of the user's UTMCAP campaigns and inserts its tracking link.
 * At send time the link gets sc_cid and sub1–4, so UTMCAP knows which email
 * the click came from and reports its conversions back.
 */
export function UtmcapLinkButton({
  slug,
  onInsert,
}: {
  slug: string;
  onInsert: (url: string, text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [campaigns, setCampaigns] = useState<UtmcapCampaignOption[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setOpen(true);
    setError(null);
    startTransition(async () => {
      const result = await listUtmcapCampaignsAction(slug);
      if (!result.ok) setError(result.error);
      else setCampaigns(result.campaigns);
    });
  }

  const shown = (campaigns ?? []).filter((c) =>
    c.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={load}>
        <Link2 />
        Insert UTMCAP link
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Insert a UTMCAP link</DialogTitle>
            <DialogDescription>
              Clicks go through the UTMCAP campaign, carrying which email they came from.
            </DialogDescription>
          </DialogHeader>
          {campaigns && campaigns.length > 6 && (
            <Input
              aria-label="Find a campaign"
              placeholder="Find a campaign"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          {pending && <p className="text-sm text-muted-foreground">Loading your campaigns…</p>}
          <FormError message={error} />
          {campaigns && campaigns.length === 0 && (
            <p className="text-sm text-muted-foreground">No campaigns in UTMCAP yet.</p>
          )}
          {shown.length > 0 && (
            <ul aria-label="UTMCAP campaigns" className="grid max-h-80 gap-1 overflow-y-auto">
              {shown.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="grid w-full gap-0.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => {
                      onInsert(c.url, c.name);
                      setOpen(false);
                    }}
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {c.url}
                      {c.status !== "active" && ` · ${c.status}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
