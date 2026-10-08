import { WOOCOMMERCE_PLUGIN_PHP } from "@/lib/woocommerce-plugin";
import { zip } from "@/lib/zip";

// The WooCommerce helper plugin, as WordPress's "Upload plugin" expects it:
// a zip holding the plugin's folder. The same for everyone, so public.
export function GET() {
  const archive = zip([
    {
      name: "sendcoop-woocommerce/sendcoop-woocommerce.php",
      data: WOOCOMMERCE_PLUGIN_PHP,
    },
  ]);
  return new Response(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="sendcoop-woocommerce.zip"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
