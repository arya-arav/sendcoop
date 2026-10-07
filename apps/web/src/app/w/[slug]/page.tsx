import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireMemberWorkspace } from "@/lib/workspace";

// Headline numbers are placeholders until sending (week 4) and conversion
// tracking (weeks 9–10) produce real data.
const stats = ["Revenue", "Conversions", "Earnings per click", "Subscribers"];

const setupSteps = [
  { title: "Import your contacts", detail: "CSV upload with field mapping", week: 2 },
  { title: "Verify a sending domain", detail: "SPF, DKIM and DMARC records", week: 4 },
  { title: "Send your first campaign", detail: "Editor, test send and scheduling", week: 6 },
  { title: "Connect UTMCAP", detail: "Two-way conversion sync", week: 11 },
];

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { user } = await requireMemberWorkspace((await params).slug);

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome, {user.name.split(" ")[0]}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((label) => (
          <Card key={label} size="sm">
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">—</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>These unlock as Sendcoop&apos;s features ship.</CardDescription>
        </CardHeader>
        <ul className="divide-y border-t">
          {setupSteps.map((step) => (
            <li key={step.title} className="flex items-center justify-between gap-4 px-6 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
              </div>
              <Badge variant="secondary">Week {step.week}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
