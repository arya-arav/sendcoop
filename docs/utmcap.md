# Connect UTMCAP

Send your email clicks through your UTMCAP campaigns, and get every conversion UTMCAP records on
them back in Sendcoop, credited to the email that earned it, including later status changes and
chargebacks.

## What connecting does

You give Sendcoop a UTMCAP API key. Sendcoop then sets up two things in your UTMCAP account:

- **A traffic source named "Sendcoop"**, like an ad network. Its external ID parameter is
  `sc_cid`, the click ID Sendcoop gives each email click. Its sub slots carry what the email was:

  | Slot   | Value                                   |
  | ------ | --------------------------------------- |
  | `sub1` | The email campaign, e.g. `spring-sale`  |
  | `sub2` | The automation (once automations exist) |
  | `sub3` | The campaign's lists or segments        |
  | `sub4` | The link, e.g. `shop-now` or `link-2`   |

  Its postback URL points at Sendcoop, so UTMCAP reports approved conversions on those clicks right
  away.

- **A webhook** for `conversion.created` and `conversion.updated`, so pending conversions that are
  approved later, rejections and chargebacks reach Sendcoop too.

Nothing else in your UTMCAP account changes.

## Connecting

1. In UTMCAP: **Settings → API → New key**. Give it write access (a read-only key can't create the
   source and webhook). Webhooks come with the API on the Growth plan and up.
2. In Sendcoop: **Integrations → UTMCAP**, paste the key and choose **Connect**.

The key is stored encrypted. Connecting again later reuses the same traffic source.

## Linking to a UTMCAP campaign

In the email editor, choose **Insert UTMCAP link** and pick a campaign. Sendcoop inserts its
tracking link (`https://<your tracking domain>/<alias>`). When someone clicks it, Sendcoop records
the click and sends them to UTMCAP with `sc_cid` and `sub1` to `sub4` added, and UTMCAP runs its
flow as usual.

Any link to one of your UTMCAP tracking domains is treated the same way, even pasted by hand,
once Sendcoop has seen that domain (it learns them when you connect and when you insert a link).

In UTMCAP, set the campaign's traffic source to **Sendcoop**.

## How conversions come back

1. UTMCAP approves a conversion and calls the Sendcoop source's postback. Sendcoop credits the
   email through `sc_cid` and notes UTMCAP's click ID next to its own.
2. UTMCAP sends the `conversion.created` webhook. Sendcoop matches it to the same conversion by
   UTMCAP's click ID and conversion ID, so it counts once.
3. Later changes (pending to approved, rejected, chargeback) arrive as `conversion.updated` and
   change the conversion in Sendcoop. A chargeback takes the revenue back from the email.

If a webhook arrives for a click no postback mentioned, Sendcoop asks UTMCAP's click log
(`GET /logs/clicks/{clickId}`) which Sendcoop click it was.

Statuses follow UTMCAP's own rules: no status means approved, `chargeback` or `refund` reverses
the sale, and a word UTMCAP doesn't recognise stays pending. Only approved conversions count as
revenue, on both sides.

Webhooks are signed (`UTMCAP-Signature`) and checked; each event is applied once, however often
UTMCAP retries it.

## Checking the numbers

**Integrations → UTMCAP → Compare with UTMCAP** puts UTMCAP's report for the Sendcoop source,
broken down by `sub1`, next to the conversions Sendcoop recorded from UTMCAP, for the last 30 days.
Revenue is compared in the currency UTMCAP reported it in.

If a row differs:

- **A conversion is still pending** on one side. Only approved ones are compared.
- **A postback or webhook didn't arrive.** UTMCAP's webhook log (**Settings → API → Webhooks**)
  shows each delivery and what Sendcoop answered; you can send a failed one again from there.
- **The campaign was renamed** after it was sent: `sub1` keeps the name it had when clicked.
- **Several workspaces share one UTMCAP account.** Each connected workspace has its own Sendcoop
  source and only takes conversions from it.

## Disconnecting

**Integrations → UTMCAP → Disconnect** removes the key from Sendcoop. The Sendcoop traffic source
and webhook stay in UTMCAP until you delete them there.
