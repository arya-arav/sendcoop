# Connect Amazon SES or SMTP

A sending server is the service that delivers your campaigns; connect Amazon SES or any SMTP provider.

## Before you start

- Only workspace owners and admins can add sending servers.
- Amazon SES is the cheapest at volume. Any SMTP provider works too.
- Credentials are encrypted and never shown again after saving. When you edit a server later, leave a password or secret blank to keep the saved one.

## Add a server

1. Go to **Settings > Sending servers** and choose **Add server**.
2. Give it a **Name**, for example "Main SES account".
3. Choose the **Type**: **Amazon SES** or **SMTP**. You can't change the type after saving.
4. Fill in the fields for that type (below).
5. Set the **Sending limits** (below).
6. Choose **Add server**.

## Amazon SES

| Field                 | What to enter                                                    |
| --------------------- | ---------------------------------------------------------------- |
| **AWS region**        | The region your SES account sends from, for example `us-east-1`. |
| **Access key ID**     | From an IAM user in your AWS account.                            |
| **Secret access key** | The matching secret.                                             |

Use an IAM user that can only call `ses:SendEmail` and `ses:SendRawEmail`. Don't use your main AWS keys.

On the AWS side, Amazon SES only sends from domains you've verified in SES, and a new SES account starts in a limited "sandbox" until you ask AWS for production access. Do both in the AWS console before sending real campaigns.

## SMTP

| Field                                 | What to enter                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Host**                              | Your provider's SMTP host, for example `smtp.example.com`. It must be a public address.                    |
| **Port**                              | Usually `587`.                                                                                             |
| **Use TLS from the start (port 465)** | Tick this only if your provider uses port 465. Otherwise Sendcoop uses STARTTLS when the server offers it. |
| **Username (optional)**               | Your SMTP username, if your provider needs one.                                                            |
| **Password**                          | Your SMTP password.                                                                                        |

## Sending limits

Set **Emails per second**, **Emails per hour** and **Emails per day** to match your provider's quota. Leave a box blank for no limit. Sendcoop holds back sends that would go over any of them and continues when the time window resets.

A new Amazon SES account allows 14 per second and 50,000 per day, so a new SES server starts with 14 per second. Raise the numbers when AWS raises your quota.

## Send a test email

After saving, the server's page has a **Send a test email** card.

1. Add a sending domain first: test emails are sent from it. See [Set up your sending domain](/help/dns).
2. Enter the **From** address, pick the domain, and enter an address under **Send to**.
3. Choose **Send test email**.

The test is signed with your domain's DKIM key, like real campaigns. If the server refuses it, Sendcoop shows the reason it gave.

## Bounces and complaints (Amazon SES)

When an address bounces for good, or someone marks your email as spam, you should stop mailing them. Amazon SES reports these through Amazon SNS. Once connected, Sendcoop takes those addresses off every list in the workspace, which protects your sender reputation.

Each server's page has a **Bounces and complaints** card with its own **SNS webhook URL**.

1. Copy the **SNS webhook URL**.
2. In Amazon SNS, create a topic and add an HTTPS subscription with this URL.
3. Sendcoop confirms the subscription automatically.
4. In Amazon SES, open your sending domain (or configuration set) and send its Bounce and Complaint notifications to that topic.

If your SMTP server is actually Amazon SES (SES SMTP credentials), you can connect the same way.

## Use the server in a campaign

In a campaign's **Content** step, choose the server under **Sending server** in **Subject and sender**. If you have no server yet, the campaign links you to **Add a sending server**.

## Delete a server

On the server's page, choose **Delete server**. Its saved credentials are deleted too, and campaigns can't use it any more.
