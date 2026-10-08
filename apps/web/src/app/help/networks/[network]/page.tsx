import { AFFILIATE_NETWORKS } from "@sendcoop/db/affiliate-networks";
import { POSTBACK_TEMPLATES, postbackUrl } from "@sendcoop/db/postback-templates";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

// One page per affiliate network (D83), made from the same definitions the
// app uses to recognize links and build postback URLs, so they can't drift.

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return AFFILIATE_NETWORKS.map((n) => ({ network: n.id }));
}

type Props = { params: Promise<{ network: string }> };

const find = (id: string) => AFFILIATE_NETWORKS.find((n) => n.id === id);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const network = find((await params).network);
  return network
    ? {
        title: `${network.name} conversion tracking`,
        description: `Track ${network.name} sales from your emails with Sendcoop.`,
      }
    : {};
}

const NO_POSTBACK: Record<string, string> = {
  amazon:
    "Amazon Associates doesn't send postbacks. Sendcoop still recognizes Amazon links, counts their clicks per email, and adds the click id as ascsubtag, which Amazon shows in its reports.",
};

export default async function NetworkGuide({ params }: Props) {
  const network = find((await params).network);
  if (!network) notFound();
  const template = POSTBACK_TEMPLATES.find((t) => t.id === network.id);
  const example =
    template?.macros &&
    postbackUrl("https://<your tracking domain>", "<your postback key>", {
      id: template.id,
      macros: template.macros,
    });

  return (
    <article>
      <Link
        href="/help/affiliate-networks"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        Affiliate networks
      </Link>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{network.name}</h1>
      <div className="help-prose mt-6">
        <p>
          Sendcoop recognizes {network.name} links in your emails by themselves: there&apos;s
          nothing to tag. Each recipient&apos;s link gets Sendcoop&apos;s click id in {network.name}
          &apos;s sub-id parameter, <code>{network.subidParam}</code>, so a sale can be credited to
          the email, and the person, that led to it.
        </p>

        <h2>Report sales back to Sendcoop</h2>
        {example ? (
          <>
            <p>
              Give {network.name} this postback URL. Copy your own, with your key and tracking
              domain already in it, from <strong>Settings &gt; Tracking</strong> in Sendcoop (choose{" "}
              {network.name}).
            </p>
            <pre>
              <code>{example}</code>
            </pre>
            <p>{template!.instructions}</p>
            <h2>What the macros mean</h2>
            <ul>
              <li>
                <code>{template!.macros!.cid}</code>: the click id Sendcoop passed in{" "}
                <code>{network.subidParam}</code>.
              </li>
              <li>
                <code>{template!.macros!.payout}</code>: your commission, recorded as the
                sale&apos;s revenue.
              </li>
              <li>
                <code>{template!.macros!.txid}</code>: the network&apos;s transaction id, so a
                repeated postback isn&apos;t counted twice.
              </li>
              {template!.macros!.status && (
                <li>
                  <code>{template!.macros!.status}</code>: the sale&apos;s status, so refunds and
                  chargebacks take the revenue back.
                </li>
              )}
              {template!.macros!.currency && (
                <li>
                  <code>{template!.macros!.currency}</code>: the commission&apos;s currency.
                </li>
              )}
            </ul>
          </>
        ) : (
          <p>
            {template?.instructions ??
              NO_POSTBACK[network.id] ??
              "This network doesn't send postbacks."}
          </p>
        )}

        <h2>Check it works</h2>
        <p>
          In <strong>Settings &gt; Tracking</strong>, <strong>Send a test conversion</strong> (in
          Recent conversions) checks that your tracking server records postbacks: the test shows up
          within a couple of seconds and doesn&apos;t count in reports. Then use {network.name}
          &apos;s own postback test, if it has one, or send a campaign with a {network.name} link to
          yourself, click it, and check the sale arrives. See{" "}
          <Link href="/help/affiliate-networks">Track affiliate sales</Link> for the whole picture.
        </p>
      </div>
    </article>
  );
}
