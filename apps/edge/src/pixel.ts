// sc.js, the website pixel (D46). Stores and shops add it to every page:
//
//   <script async src="https://<tracking>/sc.js" data-key="px_..."></script>
//
// It keeps the click id from an email link (?sc_cid=...) in a first-party
// cookie, so a sale days later on another page is still credited to the
// email. Sales are reported with sc('conversion', {...}); calls made before
// the script loads wait in window.sc.q (see the snippet in settings).
//
// On Shopify it also puts the click id in the cart (see shopify.ts).
//
// Plain ES5, no dependencies: it runs on any site, in any browser.

export const PIXEL_JS = `(function () {
  "use strict";
  var script = document.currentScript || document.querySelector('script[src*="/sc.js"]');
  if (!script) return;
  var key = script.getAttribute("data-key") || "";
  var endpoint = script.src.replace(/\\/sc\\.js(\\?.*)?$/, "/px");
  var NAME = "sc_cid";
  var MAX_AGE = 90 * 24 * 60 * 60;
  var VALID = /^[A-Za-z0-9_-]{4,64}$/;

  function readCookie() {
    var parts = document.cookie ? document.cookie.split("; ") : [];
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf("=");
      if (parts[i].slice(0, eq) === NAME) return decodeURIComponent(parts[i].slice(eq + 1));
    }
    return null;
  }

  // On the widest domain the browser accepts (store.com rather than
  // www.store.com), so it carries over to checkout.store.com.
  function writeCookie(value) {
    var base = NAME + "=" + encodeURIComponent(value) + "; path=/; max-age=" + MAX_AGE + "; samesite=lax" +
      (location.protocol === "https:" ? "; secure" : "");
    var labels = location.hostname.split(".");
    for (var i = labels.length - 2; i > 0; i--) {
      document.cookie = base + "; domain=" + labels.slice(i).join(".");
      if (readCookie() === value) return;
    }
    document.cookie = base;
  }

  function fromUrl() {
    var match = location.search.match(/[?&]sc_cid=([^&#]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  var landed = fromUrl();
  if (landed && VALID.test(landed)) writeCookie(landed);

  function clickId() {
    var cid = readCookie();
    return cid && VALID.test(cid) ? cid : null;
  }

  // On Shopify, the click id rides along in the cart, so it reaches the
  // order (as a note attribute) and the order webhook. Once per visit.
  function tagShopifyCart() {
    var cid = clickId();
    if (!cid || !window.Shopify || !window.fetch) return;
    try {
      if (sessionStorage.getItem("sc_cart") === cid) return;
    } catch (e) {}
    var root = (window.Shopify.routes && window.Shopify.routes.root) || "/";
    fetch(root + "cart/update.js", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attributes: { sc_cid: cid } })
    }).then(function (response) {
      try {
        if (response.ok) sessionStorage.setItem("sc_cart", cid);
      } catch (e) {}
    }, function () {});
  }
  tagShopifyCart();

  function send(event, data) {
    data = data || {};
    var body = JSON.stringify({
      key: key,
      cid: clickId(),
      event: event,
      value: data.value,
      currency: data.currency,
      order_id: data.order_id,
      email: data.email,
      status: data.status,
      url: location.href
    });
    // sendBeacon survives the page closing (a redirect after checkout).
    if (navigator.sendBeacon && navigator.sendBeacon(endpoint, body)) return;
    if (window.fetch) {
      fetch(endpoint, { method: "POST", body: body, keepalive: true, mode: "no-cors" });
    }
  }

  function sc(command, data) {
    if (command === "conversion" || command === "sale") send("sale", data);
    else if (command === "lead" || command === "signup") send(command, data);
    else if (command === "event") send("custom", data);
  }

  var queued = (window.sc && window.sc.q) || [];
  window.sc = sc;
  window.sc.clickId = clickId;
  for (var i = 0; i < queued.length; i++) sc.apply(null, queued[i]);
})();
`;
