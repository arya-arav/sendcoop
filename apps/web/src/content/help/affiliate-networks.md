# Track affiliate sales

Sendcoop tags each affiliate click with a click id and gets the sale back from your network by postback, so every sale is credited to the email that earned it.

## How it works

1. **Sendcoop marks your affiliate links.** When a campaign is sent, links from known affiliate networks are recognised automatically. You can add more domains yourself.
2. **Each click gets a click id.** When someone clicks, Sendcoop records the click and sends them on to your link with a click id added. On a known network's link, the click id goes into that network's sub-id parameter (for example `tid` on ClickBank or `clickref` on Awin), replacing any value you put there. On other links, it's added as `sc_cid`.
3. **The network reports the sale.** When the click turns into a sale, your network calls Sendcoop's postback URL and passes the click id back. Sendcoop credits the sale to that email.

A sale reported twice with the same transaction id counts once.

## Which links count as affiliate links

Go to **Settings > Tracking**.

- **Recognized automatically** lists the networks Sendcoop knows. Their links are marked without any setup.
- **Your affiliate domains**: add other domains, one per line, such as your own tracking domain or a network that isn't listed. Subdomains are included. Choose **Save domains**.

Changes apply to campaigns sent from now on.

## Set up the postback

Only workspace owners and admins can see the postback URL.

1. Go to **Settings > Tracking** and find **Conversion postback**.
2. Under **Ready-made for your network**, pick your network in the **Network** menu.
3. Copy the postback URL Sendcoop shows. It already has your key and your network's own macros (placeholders the network fills in).
4. Follow the instructions under it to paste it in the right place in your network.

If your network isn't in the menu, choose **Another network**. Enter its macros for the sub-id, payout and transaction id, then copy the **Custom postback URL**. Also add the network's domain to **Your affiliate domains**, so its links carry the click id as `sc_cid`. Set the network to send `sc_cid` back in its sub-id macro.

The general URL looks like this:

```
https://<tracking address>/pb?key=<your key>&cid={subid}&payout={payout}&txid={txid}
```

Replace `{subid}`, `{payout}` and `{txid}` with your network's macros. Sendcoop also understands `status` (approved, pending, rejected, refund), `currency` and `event` (sale, lead).

## Refunds and chargebacks

If your network sends a postback when a sale is refunded or charged back, Sendcoop takes the revenue back from the email. It treats the sale as reversed when:

- the status says so (for example refund, refunded, chargeback, reversed, cancelled, or ClickBank's RFND and CGBK), or
- the payout is negative.

The refund postback must carry the same transaction id as the original sale, so Sendcoop can match them. Rejected sales are recorded as rejected. Only approved conversions count as revenue.

## Currency

Sales arrive in whatever currency your network uses. Reports convert them to your **Reporting currency**, which you set on the same page. A sale without a currency is treated as USD.

## Test your setup

At the bottom of **Settings > Tracking**, the **Recent conversions** card lists the latest sales and leads from any source.

1. Choose **Send a test conversion**. Sendcoop sends a made-up sale to your own postback URL, the way a network would. It appears in the list marked **Test**, credited to **No email**, and isn't counted in your reports.
2. Then use your network's own "test postback" tool, if it has one, and choose **Check again** to see it arrive.
3. Best of all, click an affiliate link in a test campaign and make a real or test purchase. The sale should show the campaign under **Credited to**.

If the test fails with an IP message, check the IP allowlist (below).

## Security options

- **Only accept postbacks from these IPs (optional)**: enter your network's server IPs or ranges, one per line, and choose **Save IPs**. Leave it empty to accept postbacks from anywhere.
- **New key**: makes a new postback key if yours has leaked. Postbacks with the old URL stop counting, so update the URL in every network that uses it.

## Sales without a click id

If a sale arrives without a click id but with the buyer's email, Sendcoop credits that person's last email click within the **Attribution window (days)** in **Tracking options** (7 days unless you change it).

## Network guides

Step-by-step setup for each network:

- [ClickBank](/help/networks/clickbank)
- [Digistore24](/help/networks/digistore24)
- [Impact](/help/networks/impact)
- [CJ](/help/networks/cj)
- [Awin](/help/networks/awin)
- [ShareASale](/help/networks/shareasale)
- [Everflow](/help/networks/everflow)
- [TUNE (HasOffers)](/help/networks/tune)
- [MaxBounty](/help/networks/maxbounty)
- [Amazon Associates](/help/networks/amazon)
