"use client";

import { postbackUrl } from "@sendcoop/db/postback-templates";
import { useState } from "react";
import { CopyField } from "@/components/copy-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export type NetworkPostback = {
  id: string;
  name: string;
  /** Ready to paste; null when the network has no postback setting. */
  url: string | null;
  instructions: string;
};

/** Pick a network: its postback URL with its own macros, and where to paste it. */
export function NetworkPostbacks({
  networks,
  trackingUrl,
  postbackKey,
}: {
  networks: NetworkPostback[];
  trackingUrl: string;
  postbackKey: string;
}) {
  const [chosen, setChosen] = useState(networks[0]?.id ?? "custom");
  const [custom, setCustom] = useState({ cid: "{subid}", payout: "{payout}", txid: "{txid}" });
  const network = networks.find((n) => n.id === chosen);
  const customUrl = postbackUrl(trackingUrl, postbackKey, { id: "custom", macros: custom });

  return (
    <div className="grid gap-4">
      <div className="grid max-w-xs gap-2">
        <Label htmlFor="postback-network">Network</Label>
        <NativeSelect
          id="postback-network"
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
        >
          {networks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
          <option value="custom">Another network</option>
        </NativeSelect>
      </div>

      {network ? (
        <div className="grid gap-2">
          {network.url && <CopyField label={`${network.name} postback URL`} value={network.url} />}
          <p className="text-sm text-muted-foreground">{network.instructions}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            Enter your network&apos;s macros (placeholders) for the sub-id holding our click id, the
            payout and the transaction id. Also add its domain to your affiliate domains above, so
            its links carry the click id as sc_cid.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["cid", "Sub-id macro"],
                ["payout", "Payout macro"],
                ["txid", "Transaction id macro"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="grid gap-1">
                <Label htmlFor={`custom-${key}`}>{label}</Label>
                <Input
                  id={`custom-${key}`}
                  value={custom[key]}
                  onChange={(e) => setCustom((c) => ({ ...c, [key]: e.target.value.trim() }))}
                />
              </div>
            ))}
          </div>
          <CopyField label="Custom postback URL" value={customUrl} />
        </div>
      )}
    </div>
  );
}
