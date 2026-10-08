# Set up your sending domain (SPF, DKIM, DMARC)

Publish three TXT records at your DNS provider so inboxes trust the email you send from your domain.

## Why this matters

Gmail and Yahoo reject bulk mail from domains without SPF, DKIM and DMARC. Each record does one job:

| Record | What it does                                                                      |
| ------ | --------------------------------------------------------------------------------- |
| SPF    | Lists the servers allowed to send mail for your domain.                           |
| DKIM   | A signature on every email, proving it wasn't changed on the way.                 |
| DMARC  | Tells inboxes what to do with mail that fails SPF or DKIM, and sends you reports. |

## Add your domain

1. Go to **Settings > Sending domains**.
2. Under **Domain you send from**, enter the domain you'll put after the @ in your From address. You can paste an email address or a web address; Sendcoop keeps just the domain.
3. Choose **Add domain**. Sendcoop opens the domain's page with your records.

Use a subdomain such as `mail.yourbrand.com` for marketing email, so your main domain's reputation stays separate. You can't add free mailbox domains like gmail.com or outlook.com: only their providers can authenticate them.

## The records Sendcoop asks for

All three are **TXT** records. Each card on the domain's page has a copy button for the record name and the record value. Here is what they look like for `mail.yourbrand.com`:

| Record | Name                                     | Value                                                           |
| ------ | ---------------------------------------- | --------------------------------------------------------------- |
| SPF    | `mail.yourbrand.com`                     | `v=spf1 include:amazonses.com ~all`                             |
| DKIM   | `sc202610._domainkey.mail.yourbrand.com` | `v=DKIM1; k=rsa; p=…` (a long key)                              |
| DMARC  | `_dmarc.mail.yourbrand.com`              | `v=DMARC1; p=none; rua=mailto:dmarc-reports@mail.yourbrand.com` |

Always copy the exact name and value from your domain's page. The DKIM name (the part before `._domainkey`) and its key are unique to your domain, and the SPF value is the one your Sendcoop account shows.

## How verification works

- Sendcoop looks up your records every 10 minutes until the domain is verified. To check straight away, choose **Check now**. Any problems found are listed under the button.
- Each record card shows a tick once that record is found.
- The status badge shows where you are:
  - **Waiting for DNS**: not all three records are found yet.
  - **Verified**: all three records are found.
  - **Records missing**: the records still aren't all there 72 hours after you added the domain, or a verified domain lost one.
- Verified domains are checked again once a day, so you'll see if a record is removed later.

You can pick an unverified domain in a campaign, but Sendcoop warns you: emails from it may land in spam. Verify first.

## Common gotchas

### Only one SPF record

A domain can have only one SPF record. If one already exists (for example from your email provider), don't add a second. Add the `include:` part to the existing one instead:

```
v=spf1 include:_spf.google.com include:amazonses.com ~all
```

If there are two SPF records, Sendcoop reports "There are several SPF records; merge them into one."

### The name field may add your domain for you

Many DNS hosts automatically add your domain to the end of every name. If yours does, entering the full name gives you something like `sc202610._domainkey.mail.yourbrand.com.yourbrand.com`. Check what your host expects: often you only type the part before your root domain, such as `sc202610._domainkey.mail`.

### Long DKIM values

The DKIM value is long. Paste it whole. If your DNS provider asks, split it into 255-character pieces. Spaces added between the pieces are fine.

### Subdomains need their own records

If you send from `mail.yourbrand.com`, all three records go on `mail.yourbrand.com`, including `_dmarc.mail.yourbrand.com`. A DMARC record on your main domain alone doesn't verify the subdomain in Sendcoop.

### Already have a DMARC record?

Keep it. Any valid DMARC record on the right name passes. If you use the one Sendcoop suggests, `p=none` only monitors. Once everything passes, tighten it to `p=quarantine`. Reports go to `dmarc-reports@` your domain, so make sure that address exists, or change it to one you read.

### Waiting for DNS to update

Changes can take up to a few hours to appear. A long TTL (time to live) on an old record you replaced can make it slower. If **Check now** still shows a problem after a few hours, compare the record at your DNS host with the one on the domain's page, character by character.

### Cloudflare

All of Sendcoop's records are TXT records, which Cloudflare never proxies, so there is no orange-cloud setting to change. Just add them under **DNS > Records**.
