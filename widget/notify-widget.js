(function () {
  'use strict';

  var APP_URL = 'https://shopify-back-in-stock-production.up.railway.app';

  var CSS = `
    #bis-wrap {
      margin: 16px 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    /* Trigger button */
    #bis-trigger {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 14px 20px;
      background: transparent;
      color: #1a1a1a;
      border: 2px solid #1a1a1a;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.3px;
      transition: background 0.2s, color 0.2s;
    }
    #bis-trigger:hover {
      background: #1a1a1a;
      color: #fff;
    }
    #bis-trigger:hover .bis-bell {
      animation: bis-bell 0.6s ease;
    }
    .bis-bell {
      display: inline-block;
      font-size: 16px;
      transform-origin: top center;
    }
    @keyframes bis-bell {
      0%,100% { transform: rotate(0); }
      15%      { transform: rotate(12deg); }
      30%      { transform: rotate(-10deg); }
      45%      { transform: rotate(7deg); }
      60%      { transform: rotate(-5deg); }
      75%      { transform: rotate(3deg); }
    }

    /* Sliding panel */
    #bis-panel {
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transition: max-height 0.38s cubic-bezier(0.4,0,0.2,1),
                  opacity 0.3s ease,
                  margin-top 0.3s ease;
      margin-top: 0;
    }
    #bis-panel.bis-open {
      max-height: 320px;
      opacity: 1;
      margin-top: 12px;
    }
    #bis-inner {
      padding: 18px;
      background: #f8f8f8;
      border: 1px solid #e8e8e8;
      border-radius: 10px;
    }

    /* Channel pills */
    .bis-label {
      font-size: 12px;
      color: #888;
      font-weight: 500;
      margin-bottom: 10px;
      display: block;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .bis-channels {
      display: flex;
      gap: 8px;
      margin-bottom: 14px;
    }
    .bis-ch {
      flex: 1;
      padding: 9px 12px;
      background: #fff;
      border: 1.5px solid #ddd;
      border-radius: 50px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      color: #666;
      transition: border-color 0.18s, background 0.18s, color 0.18s, transform 0.15s;
    }
    .bis-ch:hover { transform: translateY(-1px); }
    .bis-ch.active {
      border-color: #1a1a1a;
      background: #1a1a1a;
      color: #fff;
    }

    /* Input */
    #bis-input {
      width: 100%;
      padding: 11px 14px;
      border: 1.5px solid #ddd;
      border-radius: 8px;
      font-size: 14px;
      box-sizing: border-box;
      margin-bottom: 10px;
      outline: none;
      background: #fff;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    #bis-input:focus {
      border-color: #1a1a1a;
      box-shadow: 0 0 0 3px rgba(26,26,26,0.08);
    }

    /* Submit */
    #bis-submit {
      width: 100%;
      padding: 12px;
      background: #1a1a1a;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.15s;
      position: relative;
      overflow: hidden;
    }
    #bis-submit:hover:not(:disabled) {
      background: #333;
      transform: translateY(-1px);
    }
    #bis-submit:active:not(:disabled) { transform: translateY(0); }
    #bis-submit:disabled { background: #aaa; cursor: not-allowed; }

    /* Loading spinner */
    .bis-spinner {
      display: none;
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: bis-spin 0.7s linear infinite;
      margin: 0 auto;
    }
    #bis-submit.bis-loading .bis-spinner { display: block; }
    #bis-submit.bis-loading .bis-btn-text { display: none; }
    @keyframes bis-spin {
      to { transform: rotate(360deg); }
    }

    /* Message */
    #bis-msg {
      margin-top: 10px;
      padding: 10px 14px;
      border-radius: 7px;
      font-size: 13px;
      display: none;
      animation: bis-fade-in 0.3s ease;
    }
    #bis-msg.success {
      background: #edf7ed;
      color: #2d7a33;
      border: 1px solid #b3ddb5;
      display: block;
    }
    #bis-msg.error {
      background: #fdf0ef;
      color: #c0392b;
      border: 1px solid #f0b8b3;
      display: block;
    }
    @keyframes bis-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;

  // ─── STATE ────────────────────────────────────────────────────────────────
  var currentVariantId     = null;
  var currentProductId     = null;
  var currentProductTitle  = '';
  var currentVariantTitle  = '';
  var currentProductHandle = '';
  var currentStoreDomain   = window.Shopify && window.Shopify.shop
    ? window.Shopify.shop : window.location.hostname;
  var selectedChannel = 'email';

  // ─── DOM ──────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('bis-styles')) return;
    var s = document.createElement('style');
    s.id = 'bis-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildWidget() {
    var wrap = document.createElement('div');
    wrap.id = 'bis-wrap';
    wrap.innerHTML = `
      <button id="bis-trigger" type="button">
        <span class="bis-bell">🔔</span>
        <span>Notify Me When Back in Stock</span>
      </button>
      <div id="bis-panel">
        <div id="bis-inner">
          <span class="bis-label">How would you like to be notified?</span>
          <div class="bis-channels">
            <button class="bis-ch" data-channel="email" type="button">✉ Email</button>
            <button class="bis-ch" data-channel="whatsapp" type="button">💬 WhatsApp</button>
          </div>
          <input id="bis-input" type="email" placeholder="your@email.com" autocomplete="email" />
          <button id="bis-submit" type="button">
            <span class="bis-btn-text">Notify Me</span>
            <div class="bis-spinner"></div>
          </button>
          <div id="bis-msg"></div>
        </div>
      </div>
    `;
    return wrap;
  }

  // ─── LOGIC ────────────────────────────────────────────────────────────────
  function setChannel(ch) {
    selectedChannel = ch;
    document.querySelectorAll('.bis-ch').forEach(function (b) {
      b.classList.toggle('active', b.dataset.channel === ch);
    });
    var inp = document.getElementById('bis-input');
    if (ch === 'whatsapp') {
      inp.type = 'tel'; inp.placeholder = '+1 555 000 0000'; inp.autocomplete = 'tel';
    } else {
      inp.type = 'email'; inp.placeholder = 'your@email.com'; inp.autocomplete = 'email';
    }
    inp.value = '';
    hideMsg();
  }

  function showMsg(text, type) {
    var m = document.getElementById('bis-msg');
    m.textContent = text; m.className = type;
  }
  function hideMsg() {
    var m = document.getElementById('bis-msg');
    if (m) { m.className = ''; m.textContent = ''; }
  }

  function showWidget() {
    var w = document.getElementById('bis-wrap');
    if (w) w.style.display = 'block';
  }
  function hideWidget() {
    var w = document.getElementById('bis-wrap');
    if (w) w.style.display = 'none';
  }

  // Fetches fresh availability from Shopify's public product endpoint.
  // Shopify serves this in the customer's current market/location context —
  // no API token required.
  async function fetchVariantUnavailable(variantId, handle) {
    if (!handle) return null;
    try {
      var res = await fetch('/products/' + handle + '.js');
      if (!res.ok) return null;
      var product = await res.json();
      var variant = null;
      for (var i = 0; i < product.variants.length; i++) {
        if (String(product.variants[i].id) === String(variantId)) {
          variant = product.variants[i];
          break;
        }
      }
      if (!variant) return null;
      // available: false  →  out of stock at this customer's location
      return !variant.available;
    } catch (e) {
      return null;
    }
  }

  function variantIsUnavailableDOM(id) {
    try {
      var meta = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
      if (meta && meta.product && meta.product.variants) {
        for (var i = 0; i < meta.product.variants.length; i++) {
          if (String(meta.product.variants[i].id) === String(id))
            return !meta.product.variants[i].available;
        }
      }
    } catch (e) {}
    try {
      var p = window.product || (window.theme && window.theme.product);
      if (p && p.variants) {
        for (var j = 0; j < p.variants.length; j++) {
          if (String(p.variants[j].id) === String(id))
            return !p.variants[j].available;
        }
      }
    } catch (e) {}
    var btn = document.querySelector('[name="add"],[data-add-to-cart],.product-form__submit,.btn-add-to-cart');
    if (btn) return btn.disabled || btn.getAttribute('aria-disabled') === 'true';
    return false;
  }

  function variantIsPreOrder() {
    var btn = document.querySelector('[name="add"],[data-add-to-cart],.product-form__submit,.btn-add-to-cart');
    if (!btn) return false;
    var text = (btn.textContent || btn.innerText || '').toLowerCase();
    return text.includes('pre-order') || text.includes('pre order') || text.includes('preorder');
  }

  async function updateVisibility() {
    if (!currentVariantId) { hideWidget(); return; }

    // Show on pre-order variants too
    if (variantIsPreOrder()) { showWidget(); return; }

    // Check actual availability via Shopify's public product endpoint (location-aware)
    var unavailable = await fetchVariantUnavailable(currentVariantId, currentProductHandle);
    if (unavailable !== null) {
      unavailable ? showWidget() : hideWidget();
      return;
    }

    // Fallback: DOM detection
    variantIsUnavailableDOM(currentVariantId) ? showWidget() : hideWidget();
  }

  function handleSubmit() {
    var inp     = document.getElementById('bis-input');
    var btn     = document.getElementById('bis-submit');
    var contact = inp.value.trim();

    hideMsg();
    if (!contact) {
      showMsg('Please enter your ' + (selectedChannel === 'email' ? 'email address' : 'phone number'), 'error');
      inp.focus();
      return;
    }

    btn.classList.add('bis-loading');
    btn.disabled = true;

    fetch(APP_URL + '/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id:     currentProductId,
        variant_id:     currentVariantId,
        product_title:  currentProductTitle,
        variant_title:  currentVariantTitle,
        product_handle: currentProductHandle,
        channel:        selectedChannel,
        contact:        contact,
        store_domain:   currentStoreDomain,
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
      .then(function (r) {
        if (r.ok) {
          showMsg("You're on the list! We'll notify you when it's back 🎉", 'success');
          inp.value = '';
        } else if (r.status === 409) {
          showMsg(r.data.message || "You're already on the list!", 'success');
        } else {
          showMsg(r.data.error || 'Something went wrong. Please try again.', 'error');
        }
      })
      .catch(function () { showMsg('Network error. Please try again.', 'error'); })
      .finally(function () {
        btn.classList.remove('bis-loading');
        btn.disabled = false;
      });
  }

  // ─── VARIANT HELPERS ──────────────────────────────────────────────────────
  function readVariantFromUrl() {
    return new URLSearchParams(window.location.search).get('variant');
  }

  function getProductMeta() {
    try {
      var m = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
      if (m && m.product) return { id: String(m.product.id || ''), title: m.product.title || document.title, handle: m.product.handle || '' };
    } catch (e) {}
    return { id: '', title: document.title, handle: '' };
  }

  function getVariantTitle(id) {
    function buildFromOptions(variant) {
      var parts = [];
      if (variant.option1) parts.push(variant.option1);
      if (variant.option2) parts.push(variant.option2);
      if (variant.option3) parts.push(variant.option3);
      return parts.join(' / ');
    }
    try {
      var m = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
      if (m && m.product && m.product.variants) {
        for (var i = 0; i < m.product.variants.length; i++) {
          if (String(m.product.variants[i].id) === String(id)) {
            var v = m.product.variants[i];
            return (v.title && v.title !== 'Default Title') ? v.title : buildFromOptions(v);
          }
        }
      }
    } catch (e) {}
    // Fallback: try window.Shopify.product (Dawn/Prestige themes)
    try {
      if (window.Shopify && window.Shopify.product && window.Shopify.product.variants) {
        for (var j = 0; j < window.Shopify.product.variants.length; j++) {
          if (String(window.Shopify.product.variants[j].id) === String(id)) {
            var v2 = window.Shopify.product.variants[j];
            return (v2.title && v2.title !== 'Default Title') ? v2.title : buildFromOptions(v2);
          }
        }
      }
    } catch (e2) {}
    return '';
  }

  function onVariantChange(id) {
    currentVariantId    = String(id);
    currentVariantTitle = getVariantTitle(id);
    var pm = getProductMeta();
    currentProductId     = pm.id;
    currentProductTitle  = pm.title;
    currentProductHandle = pm.handle;
    var panel = document.getElementById('bis-panel');
    if (panel) panel.classList.remove('bis-open');
    hideMsg();
    hideWidget(); // hide while async check runs
    updateVisibility();
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────
  function init() {
    if (window.location.pathname.indexOf('/products/') === -1) return;

    // Lebanon-only guard — hide widget for non-LB markets
    var country = window.Shopify && window.Shopify.country;
    if (country && country !== 'LB') return;

    injectStyles();

    // Place widget after the buy-button area, not inside the form
    var anchor =
      document.querySelector('.product-form__buttons') ||
      document.querySelector('[data-product-form] .shopify-payment-button') ||
      document.querySelector('[data-product-form]') ||
      document.querySelector('form[action="/cart/add"]') ||
      document.querySelector('.product-form, .product__form') ||
      document.querySelector('.product, .product-single, main');

    if (!anchor) return;

    var widget = buildWidget();
    anchor.insertAdjacentElement('afterend', widget);

    // Wire channels
    document.querySelectorAll('.bis-ch').forEach(function (b) {
      b.addEventListener('click', function () { setChannel(b.dataset.channel); });
    });
    setChannel('email');

    // Toggle panel
    document.getElementById('bis-trigger').addEventListener('click', function () {
      var panel = document.getElementById('bis-panel');
      panel.classList.toggle('bis-open');
      if (panel.classList.contains('bis-open')) {
        setTimeout(function () { document.getElementById('bis-input').focus(); }, 320);
      }
    });

    // Submit
    document.getElementById('bis-submit').addEventListener('click', handleSubmit);
    document.getElementById('bis-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleSubmit();
    });

    // Initial variant
    var urlV = readVariantFromUrl();
    if (urlV) {
      onVariantChange(urlV);
    } else {
      try {
        var m = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
        if (m && m.product && m.product.variants && m.product.variants[0])
          onVariantChange(m.product.variants[0].id);
      } catch (e) {}
    }

    // Listen for variant changes
    document.addEventListener('variant:changed', function (e) {
      var v = e.detail && (e.detail.variant || e.detail);
      if (v && v.id) onVariantChange(v.id);
    });
    document.addEventListener('variantChange', function (e) {
      var v = e.detail && e.detail.variant;
      if (v && v.id) onVariantChange(v.id);
    });

    // URL polling fallback
    var lastUrl = window.location.href;
    setInterval(function () {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        var v = readVariantFromUrl();
        if (v && v !== currentVariantId) onVariantChange(v);
      }
    }, 600);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();
})();
