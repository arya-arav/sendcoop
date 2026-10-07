import { CopyField } from "@/components/copy-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Where to point Amazon SES bounce and complaint notifications for this server. */
export function FeedbackCard({ webhookUrl, type }: { webhookUrl: string; type: "ses" | "smtp" }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Bounces and complaints</h2>
        </CardTitle>
        <CardDescription>
          {type === "ses"
            ? "Amazon SES reports bounces and spam complaints through Amazon SNS. Sendcoop then stops mailing those addresses, which protects your sender reputation."
            : "If this SMTP server is Amazon SES, it can report bounces and spam complaints through Amazon SNS too."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <CopyField label="SNS webhook URL" value={webhookUrl} />
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>In Amazon SNS, create a topic and add an HTTPS subscription with this URL.</li>
          <li>Sendcoop confirms the subscription automatically.</li>
          <li>
            In Amazon SES, open your sending domain (or configuration set) and send its Bounce and
            Complaint notifications to that topic.
          </li>
        </ol>
      </CardContent>
    </Card>
  );
}
