// The curl example for the conversion API, filled in for a workspace in
// settings. docs/conversion-api.md shows the same one with placeholders
// (a test keeps them identical).

export function conversionApiCurl({
  trackingUrl,
  workspaceId,
  secret,
}: {
  trackingUrl: string;
  workspaceId: string;
  secret: string;
}) {
  return `SENDCOOP_WORKSPACE="${workspaceId}"
SENDCOOP_SECRET="${secret}"
BODY='{"click_id":"sc4Fh9KqZ2LmPx7Ty1","value":49.99,"currency":"USD","order_id":"1042"}'
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SENDCOOP_SECRET" | sed 's/^.*= //')
curl -sS -X POST "${trackingUrl}/v1/conversions" \\
  -H "Content-Type: application/json" \\
  -H "Sendcoop-Workspace: $SENDCOOP_WORKSPACE" \\
  -H "Sendcoop-Timestamp: $TS" \\
  -H "Sendcoop-Signature: sha256=$SIG" \\
  -d "$BODY"`;
}
