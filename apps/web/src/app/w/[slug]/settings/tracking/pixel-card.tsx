import { CopyField } from "@/components/copy-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function pixelSnippet(trackingUrl: string, key: string) {
  return `<script>window.sc=window.sc||function(){(sc.q=sc.q||[]).push(arguments)};</script>
<script async src="${trackingUrl}/sc.js" data-key="${key}"></script>`;
}

export const CONVERSION_CALL = `<script>
  sc("conversion", {
    value: 49.0,            // the order total
    currency: "USD",
    order_id: "1042",       // counts a reloaded page once
    email: "buyer@example.com", // optional: credits the email when there's no click
  });
</script>`;

/** sc.js for stores and landing pages: the install snippet and the conversion call. */
export function PixelCard({ trackingUrl, pixelKey }: { trackingUrl: string; pixelKey: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Website pixel</h2>
        </CardTitle>
        <CardDescription>
          For your own store or landing pages. Links in your emails carry a click id (sc_cid); the
          pixel keeps it for 90 days, so a sale on a later visit is still credited to the email.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <h3 className="text-sm font-medium">1. On every page, in the &lt;head&gt;</h3>
          <CopyField label="Pixel snippet" value={pixelSnippet(trackingUrl, pixelKey)} multiline />
        </div>
        <div className="grid gap-2">
          <h3 className="text-sm font-medium">2. On the order confirmation page</h3>
          <CopyField label="Conversion code" value={CONVERSION_CALL} multiline />
          <p className="text-xs text-muted-foreground">
            Fill in the values from your store. For a sign-up form use sc(&quot;lead&quot;, ...)
            instead. Refunds can&apos;t come from a browser: report them with a postback or the API.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
