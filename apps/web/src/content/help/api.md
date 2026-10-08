# Developers: API, webhooks and conversion API

Connect Sendcoop to your own code and tools; this page says what each option is for and where to find its developer docs.

## Which one do you need?

| You want to…                                                                        | Use            |
| ----------------------------------------------------------------------------------- | -------------- |
| Add, update or remove subscribers, or read lists and conversions, from your code    | REST API       |
| Report sales, leads and refunds from your server (payment webhooks, CRMs, renewals) | Conversion API |
| Start automations from events in your own systems                                   | Events API     |
| Be told when people subscribe, unsubscribe, click or buy                            | Webhooks       |
| Call your server from an automation step                                            | Webhooks       |

The REST API and event webhooks depend on your plan. If your plan doesn't include them, the **API keys** and **Webhooks** pages in **Settings** say so and link to **Billing**.

## REST API

Manage your workspace's subscribers and conversions from your own code.

1. Go to **Settings > API keys**.
2. Under **New key**, enter a **Key name** (one key per tool, so you can revoke one without the others) and choose **Create key**.
3. Copy **Your new key** straight away. It's shown only once.
4. Send it with every request as `Authorization: Bearer <key>`.

The **API keys** page also shows the API's base address and a link to its `openapi.json` description. To stop a key working, choose **Revoke**. Only owners and admins manage API keys.

Developer docs: [REST API](https://github.com/arya-arav/sendcoop/blob/main/docs/api.md)

## Conversion API

Report sales, leads and refunds from your own server. Sendcoop credits each one to the email that led to it. Use it when a sale happens where a browser pixel can't see it, or can't be trusted with it.

1. Go to **Settings > Tracking** and find **Conversion API**.
2. Copy the **Workspace id** and the **API secret**. Your server signs each request with the secret.
3. Under **Try it**, copy the **curl example** to send a first request.

If the secret leaks, choose **New secret**. Requests signed with the old secret stop working, so update every server that uses it. Only owners and admins can see the API secret.

Developer docs: [Conversion API](https://github.com/arya-arav/sendcoop/blob/main/docs/conversion-api.md)

## Events API

Start automations from your own systems: a trial started, a course completed, a plan changed. Any automation whose trigger is **An event from the API**, with the same event name, starts for that subscriber. Requests are signed the same way as the conversion API, with the same workspace id and API secret.

Developer docs: [Events API](https://github.com/arya-arav/sendcoop/blob/main/docs/events-api.md)

## Webhooks

Sendcoop can send JSON to your server when things happen.

**Event webhooks.** Go to **Settings > Webhooks** and use **Add an endpoint**. Enter the **Endpoint URL**, an optional **Description**, and choose the events:

- Someone subscribed
- Someone unsubscribed
- A link in an email was clicked
- A sale or lead was recorded

Choose **Add endpoint**. Each endpoint has **Send test**, **Turn off** / **Turn on** and **Delete**. **Recent deliveries** shows the last 30 deliveries and how they went. Failed deliveries are retried for about 8 hours.

**Automation webhooks.** An automation's **Call a webhook** step calls your server, for example to create a deal in your CRM when someone finishes a sequence.

Both kinds are signed with the **Webhook signing secret** shown on the **Integrations** page, so your server can check that a request really came from Sendcoop. Webhooks only go to public `https://` addresses.

Developer docs: [Webhooks](https://github.com/arya-arav/sendcoop/blob/main/docs/webhooks.md)

## No-code options

You may not need to write code at all:

- Affiliate networks report sales by postback: see [Track affiliate sales](/help/affiliate-networks).
- Stores connect by webhook: see [Connect Shopify](/help/shopify) and [Connect WooCommerce](/help/woocommerce).
- UTMCAP connects with an API key: see [Connect UTMCAP](/help/utmcap).
- For your own site, the **Website pixel** card in **Settings > Tracking** has a snippet to paste on every page and a short code for the order confirmation page.
