// The Sendcoop helper plugin for WooCommerce (D49), offered as a zip in
// Settings > Tracking. It does one thing: keeps the click id from an email
// link (?sc_cid=...) in a cookie and saves it on the order as "sc_cid" meta,
// which order webhooks then carry to us. No settings, no outgoing requests.

export const WOOCOMMERCE_PLUGIN_VERSION = "1.0.0";

export const WOOCOMMERCE_PLUGIN_PHP = String.raw`<?php
/**
 * Plugin Name: Sendcoop for WooCommerce
 * Description: Credits orders to the Sendcoop email that led to them: keeps the click id from email links and saves it on the order.
 * Version: ${WOOCOMMERCE_PLUGIN_VERSION}
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * Author: Sendcoop
 * License: GPL-2.0-or-later
 */

defined('ABSPATH') || exit;

const SENDCOOP_COOKIE = 'sc_cid';

function sendcoop_valid_click_id($value) {
    return is_string($value) && preg_match('/^[A-Za-z0-9_-]{4,64}$/', $value) === 1;
}

// A visitor arriving from an email link: keep its click id for 90 days.
add_action('init', function () {
    if (empty($_GET['sc_cid']) || headers_sent()) {
        return;
    }
    $cid = sanitize_text_field(wp_unslash($_GET['sc_cid']));
    if (!sendcoop_valid_click_id($cid)) {
        return;
    }
    setcookie(SENDCOOP_COOKIE, $cid, [
        'expires' => time() + 90 * DAY_IN_SECONDS,
        'path' => COOKIEPATH ? COOKIEPATH : '/',
        'domain' => COOKIE_DOMAIN ? COOKIE_DOMAIN : '',
        'secure' => is_ssl(),
        'httponly' => false,
        'samesite' => 'Lax',
    ]);
    $_COOKIE[SENDCOOP_COOKIE] = $cid;
});

// On the order, as "sc_cid": meta starting with an underscore is left out of webhooks.
function sendcoop_tag_order($order) {
    $cid = isset($_COOKIE[SENDCOOP_COOKIE]) ? sanitize_text_field(wp_unslash($_COOKIE[SENDCOOP_COOKIE])) : '';
    if (sendcoop_valid_click_id($cid)) {
        $order->update_meta_data('sc_cid', $cid);
    }
}

// The classic checkout...
add_action('woocommerce_checkout_create_order', function ($order) {
    sendcoop_tag_order($order);
});

// ...and the block checkout.
add_action('woocommerce_store_api_checkout_update_order_from_request', function ($order) {
    sendcoop_tag_order($order);
    $order->save();
});

add_action('before_woocommerce_init', function () {
    if (class_exists('\Automattic\WooCommerce\Utilities\FeaturesUtil')) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('cart_checkout_blocks', __FILE__, true);
    }
});
`;
