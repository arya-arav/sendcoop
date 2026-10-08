import {
  Globe,
  KeyRound,
  MousePointerClick,
  ReceiptText,
  Send,
  Users,
  Webhook,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberWorkspace } from "@/lib/workspace";

const sections = [
  {
    title: "Sending domains",
    description: "Authenticate the domains you send from with SPF, DKIM and DMARC.",
    icon: Globe,
    path: "/settings/domains",
  },
  {
    title: "Sending servers",
    description: "Amazon SES or SMTP: the service that delivers your email.",
    icon: Send,
    path: "/settings/servers",
  },
  {
    title: "Tracking",
    description: "Which links are affiliate links, for revenue and click reports.",
    icon: MousePointerClick,
    path: "/settings/tracking",
  },
  {
    title: "Team",
    description: "Invite people and set their roles.",
    icon: Users,
    path: "/settings/team",
  },
  {
    title: "Billing",
    description: "Your plan, usage and invoices.",
    icon: ReceiptText,
    path: "/settings/billing",
  },
  {
    title: "API keys",
    description: "Connect other tools to this workspace.",
    icon: KeyRound,
    path: "/settings/api",
  },
  {
    title: "Webhooks",
    description: "Tell your other tools when people subscribe, click and buy.",
    icon: Webhook,
    path: "/settings/webhooks",
  },
];

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireMemberWorkspace(slug);

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => {
          const card = (
            <Card className="h-full transition-colors hover:bg-muted/40">
              <CardHeader>
                <section.icon className="size-5 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="flex items-center gap-2">
                  {section.title}
                  {!section.path && <Badge variant="outline">Soon</Badge>}
                </CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          );
          return section.path ? (
            <Link key={section.title} href={`/w/${slug}${section.path}`}>
              {card}
            </Link>
          ) : (
            <div key={section.title} className="opacity-60">
              {card}
            </div>
          );
        })}
      </div>
    </div>
  );
}
