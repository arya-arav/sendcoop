// What new HTML-code and plain-text templates start with: working examples
// of merge tags, the unsubscribe link and the postal address the law asks for.

export const STARTER_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Your email</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
  <!-- Tables keep the layout together in Outlook. -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;">
          <tr>
            <td style="padding:32px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#3f3f46;">
              <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#18181b;">Hi {{first_name | there}},</h1>
              <p style="margin:0 0 16px;">Write your message here.</p>
              <p style="margin:0;"><a href="https://example.com" style="color:#18181b;font-weight:bold;">Read more</a></p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#71717a;">
          Your Company, 123 Street, City, Country<br>
          <a href="{{unsubscribe_url}}" style="color:#71717a;">Unsubscribe</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export const STARTER_TEXT = `Hi {{first_name | there}},

Write your message here. Plain-text emails look like a personal note, and
often land in the main inbox rather than Promotions.

Thanks,
Your name

--
Your Company, 123 Street, City, Country
`;
