# Connect Shopify

Send your Shopify orders and refunds to Sendcoop, so each sale is credited to the email that led to it.

## How it works

Every link in your emails carries a click id (`sc_cid`). The Sendcoop website pixel on your store remembers it and adds it to the shopper's cart, and Shopify keeps it on the order. When an order is placed, Shopify tells Sendcoop through a webhook, and Sendcoop credits the sale to the email that was clicked.

If an order arrives without a click id, Sendcoop uses the buyer's email instead: their last email click within your attribution window gets the credit.

## Before you start

- Only workspace owners and admins can connect Shopify.
- You need access to your Shopify admin and your theme code.
- Everything is on one page in Sendcoop: **Settings > Tracking**. (**Integrations > Shopify and WooCommerce** takes you there too.)

## Step 1: Add the website pixel to your theme

1. In Sendcoop, go to **Settings > Tracking** and find **Website pixel**.
2. Copy the **Pixel snippet** (under "1. On every page, in the <head>").
3. In Shopify, edit your theme's code and open `theme.liquid`.
4. Paste the snippet inside the `<head>` section and save.

You don't need the **Conversion code** from step 2 of that card for Shopify: the webhook reports your orders.

## Step 2: Add three webhooks in Shopify

1. In Sendcoop, find the **Shopify** card and copy the **Shopify webhook URL**.
2. In Shopify, go to **Settings > Notifications > Webhooks**.
3. Create a webhook with the event **Order creation**, format **JSON**, and paste the URL.
4. Create a second webhook with the event **Order payment**, format **JSON**, and the same URL. Orders paid later (bank transfer, cash on delivery) count once they are paid.
5. Create a third webhook with the event **Refund create**, format **JSON**, and the same URL.

## Step 3: Save Shopify's signing secret

Shopify signs every webhook, so Sendcoop can check it really came from your store.

1. In Shopify, on the same webhooks page, find the secret shown below your webhooks (the line saying your webhooks are "signed with" it).
2. In Sendcoop, paste it into **Webhook signing secret** on the **Shopify** card.
3. Choose **Save**.

The card now shows **Connected**. Until the secret is saved, Sendcoop refuses Shopify's webhooks.

## Check that it works

1. Send yourself a test campaign with a link to your store.
2. Click the link and place an order.
3. In Sendcoop, open **Settings > Tracking** and look at **Recent conversions**. Choose **Check again** to refresh. Your order should appear from **Shopify**, with your campaign under **Credited to**.

## What Sendcoop records

- **Order value**: the order total, in your shop's currency. Reports convert it to your **Reporting currency**.
- **Status**: paid orders count as approved. Orders still awaiting payment are recorded as pending, voided orders as rejected, and refunded orders as reversed. Only approved sales count as revenue.
- **Refunds**: each refund reduces the order's revenue by the refunded amount. A full refund reverses the sale. The same refund sent twice counts once.

## Troubleshooting

- **Orders arrive but say "No email" under Credited to.** The order had no click id and the buyer's email didn't match a recent click. Check that the pixel snippet is in `theme.liquid` on every page, and that the shopper came from an email link.
- **Nothing arrives at all.** Check that both webhooks use the exact URL from Sendcoop, that the format is JSON, and that the signing secret is saved.
- **You changed the secret in Shopify.** Paste the new one into **Webhook signing secret** and choose **Save**. It replaces the old one.
