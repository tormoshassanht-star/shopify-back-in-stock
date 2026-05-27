(function () {
  'use strict';

  // ─── CONFIG ───────────────────────────────────────────────────────────────
  // Replace this with your deployed app URL before pasting into Shopify
  var APP_URL = 'https://your-app-url.com';

  // ─── STYLES ───────────────────────────────────────────────────────────────
  var CSS = [
    '#bis-container{margin:12px 0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
    '#bis-btn{width:100%;padding:14px 20px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;',
      'font-size:15px;font-weight:600;cursor:pointer;transition:background .2s}',
    '#bis-btn:hover{background:#333}',
    '#bis-form{display:none;margin-top:10px;padding:16px;background:#f9f9f9;border-radius:6px;',
      'border:1px solid #e5e5e5}',
    '#bis-form.bis-open{display:block}',
    '.bis-channel-row{display:flex;gap:8px;margin-bottom:12px}',
    '.bis-channel-btn{flex:1;padding:8px 12px;background:#fff;border:2px solid #ddd;border-radius:5px;',
      'font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;color:#555}',
    '.bis-channel-btn.active{border-color:#1a1a1a;background:#1a1a1a;color:#fff}',
    '#bis-input{width:100%;padding:10px 12px;border:1px solid #ccc;border-radius:5px;font-size:14px;',
      'box-sizing:border-box;margin-bottom:10px;outline:none;transition:border-color .15s}',
    '#bis-input:focus{border-color:#1a1a1a}',
    '#bis-submit{width:100%;padding:11px;background:#1a1a1a;color:#fff;border:none;border-radius:5px;',
      'font-size:14px;font-weight:600;cursor:pointer;transition:background .2s}',
    '#bis-submit:hover{background:#333}',
    '#bis-submit:disabled{background:#aaa;cursor:not-allowed}',
    '#bis-msg{margin-top:8px;padding:10px 12px;border-radius:5px;font-size:13px;display:none}',
    '#bis-msg.success{background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;display:block}',
    '#bis-msg.error{background:#fdecea;color:#c62828;border:1px solid #ef9a9a;display:block}',
    '.bis-label{font-size:12px;color:#777;margin-bottom:6px;display:block}',
  ].join('');

  // ─── STATE ────────────────────────────────────────────────────────────────
  var currentVariantId     = null;
  var currentProductId     = null;
  var currentProductTitle  = '';
  var currentVariantTitle  = '';
  var currentProductHandle = '';
  var currentStoreDomain   = window.Shopify && window.Shopify.shop
    ? window.Shopify.shop
    : (window.location.hostname);
  var selectedChannel      = 'email';

  // ─── DOM HELPERS ──────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('bis-styles')) return;
    var style = document.createElement('style');
    style.id = 'bis-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function buildWidget() {
    var el = document.createElement('div');
    el.id = 'bis-container';
    el.innerHTML = [
      '<button id="bis-btn" type="button">Notify Me When Back in Stock</button>',
      '<div id="bis-form">',
        '<span class="bis-label">How would you like to be notified?</span>',
        '<div class="bis-channel-row">',
          '<button class="bis-channel-btn" data-channel="email" type="button">✉ Email</button>',
          '<button class="bis-channel-btn" data-channel="whatsapp" type="button">💬 WhatsApp</button>',
        '</div>',
        '<input id="bis-input" type="email" placeholder="your@email.com" autocomplete="email" />',
        '<button id="bis-submit" type="button">Notify Me</button>',
        '<div id="bis-msg"></div>',
      '</div>',
    ].join('');
    return el;
  }

  // ─── WIDGET LOGIC ─────────────────────────────────────────────────────────
  function setChannel(channel) {
    selectedChannel = channel;
    document.querySelectorAll('.bis-channel-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.channel === channel);
    });
    var input = document.getElementById('bis-input');
    if (channel === 'whatsapp') {
      input.type        = 'tel';
      input.placeholder = '+1 555 000 0000';
      input.autocomplete = 'tel';
    } else {
      input.type        = 'email';
      input.placeholder = 'your@email.com';
      input.autocomplete = 'email';
    }
    input.value = '';
    hideMessage();
  }

  function showMessage(text, type) {
    var msg = document.getElementById('bis-msg');
    msg.textContent = text;
    msg.className = type; // 'success' or 'error'
  }

  function hideMessage() {
    var msg = document.getElementById('bis-msg');
    if (msg) { msg.className = ''; msg.textContent = ''; }
  }

  function showWidget() {
    var c = document.getElementById('bis-container');
    if (c) c.style.display = 'block';
  }

  function hideWidget() {
    var c = document.getElementById('bis-container');
    if (c) c.style.display = 'none';
  }

  // Returns true when the current variant is unavailable / sold out
  function variantIsUnavailable(variantId) {
    // Method 1: ShopifyAnalytics meta
    try {
      var meta = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
      if (meta && meta.product && meta.product.variants) {
        var variants = meta.product.variants;
        for (var i = 0; i < variants.length; i++) {
          if (String(variants[i].id) === String(variantId)) {
            return !variants[i].available;
          }
        }
      }
    } catch (e) {}

    // Method 2: window.theme or window.product global (some themes expose this)
    try {
      var product = window.product || (window.theme && window.theme.product);
      if (product && product.variants) {
        for (var j = 0; j < product.variants.length; j++) {
          if (String(product.variants[j].id) === String(variantId)) {
            return !product.variants[j].available;
          }
        }
      }
    } catch (e) {}

    // Method 3: DOM — if the add-to-cart button is disabled/hidden, assume sold out
    var addToCart = document.querySelector('[name="add"], [data-add-to-cart], .product-form__submit, .btn-add-to-cart');
    if (addToCart) {
      return addToCart.disabled || addToCart.getAttribute('aria-disabled') === 'true';
    }

    return false;
  }

  function updateWidgetVisibility() {
    if (!currentVariantId) { hideWidget(); return; }
    if (variantIsUnavailable(currentVariantId)) {
      showWidget();
    } else {
      hideWidget();
    }
  }

  function handleSubmit() {
    var input  = document.getElementById('bis-input');
    var btn    = document.getElementById('bis-submit');
    var contact = input.value.trim();

    hideMessage();

    if (!contact) {
      showMessage('Please enter your ' + (selectedChannel === 'email' ? 'email address' : 'phone number'), 'error');
      input.focus();
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Sending…';

    var payload = {
      product_id:     currentProductId,
      variant_id:     currentVariantId,
      product_title:  currentProductTitle,
      variant_title:  currentVariantTitle,
      product_handle: currentProductHandle,
      channel:        selectedChannel,
      contact:        contact,
      store_domain:   currentStoreDomain,
    };

    fetch(APP_URL + '/subscribe', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; }); })
      .then(function (res) {
        if (res.ok) {
          showMessage("You're on the list! We'll notify you when it's back. 🎉", 'success');
          input.value = '';
        } else if (res.status === 409) {
          showMessage(res.data.message || "You're already on the list!", 'success');
        } else {
          showMessage(res.data.error || 'Something went wrong. Please try again.', 'error');
        }
      })
      .catch(function () {
        showMessage('Network error. Please check your connection and try again.', 'error');
      })
      .finally(function () {
        btn.disabled    = false;
        btn.textContent = 'Notify Me';
      });
  }

  // ─── VARIANT DETECTION ────────────────────────────────────────────────────
  function readCurrentVariantFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get('variant');
  }

  function getProductMeta() {
    try {
      var meta = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
      if (meta && meta.product) {
        return {
          id:     String(meta.product.id || ''),
          title:  meta.product.title || document.title,
          handle: meta.product.handle || '',
        };
      }
    } catch (e) {}

    // Fallback: scrape from page meta / JSON-LD
    try {
      var ld = document.querySelector('script[type="application/ld+json"]');
      if (ld) {
        var json = JSON.parse(ld.textContent);
        if (json['@type'] === 'Product') {
          return { id: '', title: json.name || '', handle: '' };
        }
      }
    } catch (e) {}

    return { id: '', title: document.title, handle: '' };
  }

  function getVariantTitle(variantId) {
    try {
      var meta = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
      if (meta && meta.product && meta.product.variants) {
        for (var i = 0; i < meta.product.variants.length; i++) {
          if (String(meta.product.variants[i].id) === String(variantId)) {
            return meta.product.variants[i].title || '';
          }
        }
      }
    } catch (e) {}
    return '';
  }

  function onVariantChange(variantId) {
    currentVariantId    = String(variantId);
    currentVariantTitle = getVariantTitle(variantId);

    var productMeta      = getProductMeta();
    currentProductId     = productMeta.id;
    currentProductTitle  = productMeta.title;
    currentProductHandle = productMeta.handle;

    // Reset form state on variant switch
    var form = document.getElementById('bis-form');
    if (form) form.classList.remove('bis-open');
    hideMessage();

    updateWidgetVisibility();
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────
  function init() {
    // Only run on product pages
    if (window.location.pathname.indexOf('/products/') === -1) return;

    injectStyles();

    // Inject widget after the add-to-cart form
    var anchor = document.querySelector(
      '[data-add-to-cart-form], .product-form__buttons, .product-form, .product__form, form[action="/cart/add"]'
    );
    if (!anchor) {
      // Fallback: append to product description container
      anchor = document.querySelector('.product, .product-single, #product-content, main');
    }
    if (!anchor) return;

    var widget = buildWidget();
    anchor.insertAdjacentElement('afterend', widget);

    // Wire up channel toggles
    document.querySelectorAll('.bis-channel-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { setChannel(btn.dataset.channel); });
    });
    setChannel('email'); // default selection

    // Wire up notify-me button toggle
    document.getElementById('bis-btn').addEventListener('click', function () {
      var form = document.getElementById('bis-form');
      form.classList.toggle('bis-open');
      if (form.classList.contains('bis-open')) {
        document.getElementById('bis-input').focus();
      }
    });

    // Wire up form submit
    document.getElementById('bis-submit').addEventListener('click', handleSubmit);
    document.getElementById('bis-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleSubmit();
    });

    // Detect initial variant
    var urlVariant = readCurrentVariantFromUrl();
    if (urlVariant) {
      onVariantChange(urlVariant);
    } else {
      // Try to get the first variant from product meta
      try {
        var meta = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
        if (meta && meta.product && meta.product.variants && meta.product.variants[0]) {
          onVariantChange(meta.product.variants[0].id);
        }
      } catch (e) {}
    }

    // Listen for variant change events (fired by most themes)
    document.addEventListener('variant:changed', function (e) {
      var variant = e.detail && (e.detail.variant || e.detail);
      if (variant && variant.id) onVariantChange(variant.id);
    });

    // Some themes dispatch a custom 'variantChange' or update the URL
    document.addEventListener('variantChange', function (e) {
      var variant = e.detail && e.detail.variant;
      if (variant && variant.id) onVariantChange(variant.id);
    });

    // Fallback: watch URL for ?variant= changes (for themes that update the URL)
    var lastUrl = window.location.href;
    setInterval(function () {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        var v = readCurrentVariantFromUrl();
        if (v && v !== currentVariantId) onVariantChange(v);
      }
    }, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
