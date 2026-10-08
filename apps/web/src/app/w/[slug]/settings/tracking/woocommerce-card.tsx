import { Download } from "lucide-react";
import { CopyField } from "@/components/copy-field";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** WooCommerce orders by webhook, with the helper plugin that saves the click id on orders. */
export function WooCommerceCard({
  webhookUrl,
  secret,
}: {
  /** Both null for members. */
  webhookUrl: string | null;
  secret: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>WooCommerce</h2>
        </CardTitle>
        <CardDescription>
          Orders and refunds from your WooCommerce store, credited to the email that led to them.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {webhookUrl && secret ? (
          <>
            <ol className="grid list-decimal gap-2 pl-5 text-sm">
              <li>
                Install the Sendcoop plugin: in WordPress, Plugins &gt; Add New &gt; Upload Plugin.
                It saves the click id from email links on each order.
              </li>
              <li>
                In WooCommerce: Settings &gt; Advanced &gt; Webhooks, add two webhooks with this URL
                and secret, topics <strong>Order created</strong> and <strong>Order updated</strong>{" "}
                (API version: WP REST API v3).
              </li>
            </ol>
            <a
              href="/downloads/sendcoop-woocommerce.zip"
              download
              className={buttonVariants({ variant: "outline", className: "w-fit" })}
            >
              <Download />
              Download the plugin
            </a>
            <CopyField label="WooCommerce delivery URL" value={webhookUrl} />
            <CopyField label="WooCommerce secret" value={secret} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only workspace owners and admins can connect WooCommerce.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
