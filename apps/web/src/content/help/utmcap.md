# Connect UTMCAP

Send your email clicks through your UTMCAP campaigns and get every conversion UTMCAP records on them back in Sendcoop, including later status changes and chargebacks.

## What connecting does

You give Sendcoop a UTMCAP API key. Sendcoop then sets up two things in your UTMCAP account for you:

- **A traffic source named "Sendcoop"**, like an ad network. If you already have a source with that name, the new one is named "Sendcoop (your workspace name)". UTMCAP uses it to tell Sendcoop about conversions on your email clicks straight away.
- **A webhook** for conversions being created and updated, so conversions approved later, rejections and chargebacks reach Sendcoop too.

Nothing else in your UTMCAP account changes.

## Connect

Only workspace owners and admins can connect UTMCAP.

1. In UTMCAP, go to **Settings → API → New key**. Give it write access: a read-only key can't create the traffic source and webhook.
2. In Sendcoop, go to **Integrations** and find the **UTMCAP** card.
3. Paste the key into **UTMCAP API key** (it starts with `utmk_`) and choose **Connect**.

The key is stored encrypted. The card then shows **Connected**, with the name of the **Traffic source** Sendcoop created. If you connect again later, Sendcoop reuses the same traffic source.

## Point your UTMCAP campaigns at Sendcoop

In UTMCAP, set each campaign you'll link to from email to use the Sendcoop traffic source (the name shown on the **UTMCAP** card).

## Add UTMCAP links to your emails

1. Open the email in the editor (a campaign's **Edit email**, or a template).
2. Choose **Insert UTMCAP link**.
3. Pick a campaign from the list. Use **Find a campaign** to search if you have many.

Sendcoop inserts the campaign's tracking link. You can also paste links to your UTMCAP tracking domains by hand: once Sendcoop knows a domain (it learns them when you connect and when you insert a link), any link to it is treated the same way.

## What happens when someone clicks

Sendcoop records the click, then sends the person to UTMCAP with these details added to the link:

| Parameter | What it holds                                 |
| --------- | --------------------------------------------- |
| `sc_cid`  | Sendcoop's click id for this click            |
| `sub1`    | The email campaign, for example `spring-sale` |
| `sub2`    | The automation, if the email came from one    |
| `sub3`    | The campaign's lists or segments              |
| `sub4`    | The link, for example `shop-now` or `link-2`  |

UTMCAP then runs its flow as usual. In your UTMCAP reports, `sub1` to `sub4` tell you which email, list and link each click came from.

## How conversions come back

1. When UTMCAP approves a conversion, it tells Sendcoop right away through the Sendcoop traffic source. Sendcoop credits the email that was clicked.
2. UTMCAP's webhook then sends the same conversion. Sendcoop matches the two, so it counts once.
3. Later changes (pending to approved, rejected, chargeback) arrive by webhook and update the conversion in Sendcoop. A chargeback takes the revenue back from the email.

Only approved conversions count as revenue, in both UTMCAP and Sendcoop. You'll see UTMCAP conversions under **Recent conversions** in **Settings > Tracking**, from **UTMCAP**.

## Check the numbers

On the **UTMCAP** card, under **Check the numbers**, choose **Compare with UTMCAP**. Sendcoop puts UTMCAP's report for the Sendcoop source next to its own, for the last 30 days, by email campaign (`sub1`). It compares approved conversions only, in the currency UTMCAP reported them in. Each row says **Matches** or **Differs**.

If a row differs, it's usually one of these:

- **A conversion is still pending** on one side.
- **A postback or webhook didn't arrive.** UTMCAP's webhook log (**Settings → API → Webhooks**) shows each delivery and what Sendcoop answered. You can send a failed one again from there.
- **The campaign was renamed** after it was sent: `sub1` keeps the name it had when it was clicked.
- **Several workspaces share one UTMCAP account.** Each connected workspace has its own Sendcoop source and only takes conversions from it.

## Disconnect

On the **UTMCAP** card, choose **Disconnect**. Sendcoop removes the key. The Sendcoop traffic source and webhook stay in UTMCAP until you delete them there.
