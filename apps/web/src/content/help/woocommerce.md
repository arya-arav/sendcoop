# Connect WooCommerce

Send your WooCommerce orders and refunds to Sendcoop, so each sale is credited to the email that led to it.

## How it works

Every link in your emails carries a click id (`sc_cid`). The Sendcoop plugin for WordPress keeps that click id for 90 days and saves it on the order when the shopper checks out. WooCommerce then sends the order to Sendcoop through a webhook, and Sendcoop credits the sale to the email that was clicked.

If an order arrives without a click id, Sendcoop uses the buyer's email instead: their last email click within your attribution window gets the credit.

## Before you start

- Only workspace owners and admins can connect WooCommerce.
- You need to be able to install plugins on your WordPress site.
- The plugin needs WordPress 6.0 or later, PHP 7.4 or later, and WooCommerce.
- Everything is on one page in Sendcoop: **Settings > Tracking**, in the **WooCommerce** card. (**Integrations > Shopify and WooCommerce** takes you there too.)

## Step 1: Install the Sendcoop plugin

1. In Sendcoop, go to **Settings > Tracking** and, in the **WooCommerce** card, choose **Download the plugin**. You get a zip file.
2. In WordPress, go to **Plugins > Add New > Upload Plugin**.
3. Upload the zip file, install it, and activate **Sendcoop for WooCommerce**.

The plugin has no settings and doesn't send anything anywhere. It works with both the classic checkout and the block checkout.

## Step 2: Add two webhooks in WooCommerce

The **WooCommerce** card shows a **WooCommerce delivery URL** and a **WooCommerce secret**. Keep it open.

1. In WordPress, go to **WooCommerce > Settings > Advanced > Webhooks** and add a webhook.
2. Set the status to active and the topic to **Order created**.
3. Paste the **WooCommerce delivery URL** into the delivery URL field.
4. Paste the **WooCommerce secret** into the secret field.
5. Choose the API version **WP REST API v3** and save.
6. Add a second webhook the same way, with the topic **Order updated**.

When you save, WooCommerce sends a quick check to the URL. Sendcoop answers it, so the webhook saves without errors.

The **Order updated** webhook matters: it's how Sendcoop learns about payments, cancellations and refunds after the order is placed.

## Check that it works

1. Send yourself a test campaign with a link to your store.
2. Click the link and place an order.
3. In Sendcoop, open **Settings > Tracking** and look at **Recent conversions**. Choose **Check again** to refresh. Your order should appear from **WooCommerce**, with your campaign under **Credited to**.

## What Sendcoop records

- **Order value**: the order total, in your store's currency. Reports convert it to your **Reporting currency**.
- **Status** follows the WooCommerce order status:

| WooCommerce status       | In Sendcoop |
| ------------------------ | ----------- |
| Pending payment, On hold | Pending     |
| Processing, Completed    | Approved    |
| Cancelled, Failed        | Rejected    |
| Refunded                 | Reversed    |

Only approved sales count as revenue.

- **Refunds**: each refund on the order reduces its revenue by the refunded amount, so partial refunds work too. A full refund reverses the sale. The same refund is never counted twice, however often the order is updated.

## Troubleshooting

- **Orders arrive but say "No email" under Credited to.** The order had no click id and the buyer's email didn't match a recent click. Check that the plugin is active, and that the shopper came from an email link to the same site.
- **Nothing arrives at all.** Check that both webhooks are active, use the exact delivery URL and secret from Sendcoop, and use the topics **Order created** and **Order updated**. WooCommerce's webhook page shows recent deliveries and any errors.
- **Payments or refunds don't update.** Make sure the **Order updated** webhook exists and is active.
