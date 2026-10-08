# Set up Sendcoop

Go from a new account to a sent campaign with its revenue tracked, in eight short steps.

## 1. Create your account

1. Go to the sign-up page and fill in **Your name**, **Work email** and **Password**.
2. Choose **Create account**.
3. Sendcoop sends you a confirmation link. Open it to finish signing up. If it doesn't arrive, use the resend button on the **Check your inbox** page.

## 2. Create your workspace

A workspace holds your lists, campaigns and revenue reports. You can invite your team later from **Settings > Team**.

1. On **Create your workspace**, type a **Workspace name** (your business or brand).
2. Choose **Create workspace**.

Your dashboard has a **Getting started** checklist that links to the next steps.

## 3. Connect a sending server

The sending server is the service that actually delivers your email: Amazon SES or any SMTP provider.

1. Go to **Settings > Sending servers** and choose **Add server**.
2. Pick the **Type**, fill in the connection details and the sending limits, then choose **Add server**.

Full details: [Connect Amazon SES or SMTP](/help/sending-servers).

## 4. Add and verify a sending domain

Gmail and Yahoo reject bulk mail from domains without SPF, DKIM and DMARC.

1. Go to **Settings > Sending domains**.
2. Under **Domain you send from**, enter your domain (a subdomain like `mail.yourbrand.com` is a good idea) and choose **Add domain**.
3. Add the three TXT records Sendcoop shows at your DNS provider.
4. Wait for the status to change to **Verified**. Sendcoop checks every 10 minutes, or choose **Check now**.

Full details: [Set up your sending domain](/help/dns).

## 5. Create a list and add subscribers

1. Go to **Lists** and choose **Create your first list** (or **New list**). Give it a **Name** and choose **Create list**.
2. Go to **Contacts** and choose **Import**.
3. Drop a CSV file or choose **Choose file**. Files can be up to 100 MB, with one subscriber per row and a column for email addresses.
4. Under **Match columns**, tell Sendcoop which column holds what.
5. Under **Options**, tick the lists to add everyone to. Tick **Update existing subscribers** if you want names and fields filled in for people already in your workspace.
6. Check the **Preview**, tick the box confirming everyone in the file agreed to receive your email, and choose **Start import**.

To add one person at a time, choose **Add subscriber** on the **Contacts** page instead.

## 6. Build your first campaign

1. Go to **Campaigns** and choose **Create your first campaign** (or **New campaign**).
2. **Recipients**: give it a **Campaign name**. Under **Send to**, choose **Everyone subscribed** or **People in specific lists or segments**. Use **Don't send to** to leave lists or segments out. Choose **Save recipients**.
3. **Content**: in the **Email** card, pick a template and choose **Use template**, or start from **Blank design**, **HTML code** or **Plain text**. Choose **Edit email** to change it.
4. In **Subject and sender**, fill in **Subject**, **Preview text** (optional), **From name** and **From address**, pick your sending domain after the @, and choose the **Sending server**. Choose **Save subject and sender**.
5. Use **Send a test** to send yourself a copy.

## 7. Send it

1. Open the **Schedule** step.
2. Check the **Before sending** checklist. Every item must be ticked: recipients, subject, email content, sending domain and server, list quality and your plan's limits.
3. Under **When**, choose **Send now**, **Schedule**, or **Schedule in each subscriber's timezone**.
4. Choose **Send to … recipients** (or **Schedule**).

## 8. See your revenue

Revenue shows up once Sendcoop hears about sales. Connect at least one source:

- Affiliate offers: [Track affiliate sales](/help/affiliate-networks)
- Your store: [Connect Shopify](/help/shopify) or [Connect WooCommerce](/help/woocommerce)
- UTMCAP: [Connect UTMCAP](/help/utmcap)

Then:

- Each campaign's page shows **Delivered**, **Opened**, **Clicked**, **Click-to-open**, **Unsubscribed** and **Revenue**, plus a **Links** breakdown.
- **Revenue** in the sidebar shows **Revenue**, **Earnings per click**, **Revenue per 1,000 sent** and **Return on cost**, by campaign, link, or list and segment, for 7, 30 or 90 days or all time.
- To see **Return on cost**, add a cost to the campaign.
