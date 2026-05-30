// Resend HTTP API — Railway blocks SMTP, and Shopify Flow can't email a
// dynamic recipient, so transactional email goes through Resend.
async function sendEmail(subscriber, productUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    const msg = 'RESEND_API_KEY or EMAIL_FROM not configured';
    console.error(`[${new Date().toISOString()}] Email: ${msg}`);
    return { success: false, error: msg };
  }

  const variant = subscriber.variant_title && subscriber.variant_title !== 'Default Title'
    ? subscriber.variant_title
    : '';
  const productLabel = variant
    ? `${subscriber.product_title} (${variant})`
    : subscriber.product_title;

  const subject = `It's back in stock — ${productLabel}`;
  const html = buildHtml(productLabel, productUrl);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from,
        to: subscriber.contact,
        subject,
        html,
        ...(process.env.EMAIL_REPLY_TO ? { reply_to: process.env.EMAIL_REPLY_TO } : {}),
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[${new Date().toISOString()}] Email send failed for ${subscriber.contact}: HTTP ${res.status} ${errBody}`);
      return { success: false, error: `HTTP ${res.status}: ${errBody}` };
    }

    const data = await res.json();
    console.log(`[${new Date().toISOString()}] Email sent to ${subscriber.contact} for variant ${subscriber.variant_id} (id: ${data.id})`);
    return { success: true };
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Email send failed for ${subscriber.contact}:`, err.message);
    return { success: false, error: err.message };
  }
}

function buildHtml(productLabel, productUrl) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Back in Stock</title>
  <style>
    @media only screen and (max-width:600px){
      .hs-container{width:100%!important}
      .hs-pad{padding-left:24px!important;padding-right:24px!important}
      .hs-h1{font-size:30px!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#ffffff;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    It's back &mdash; and this time it won't last. The piece you wanted is in stock again.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:0 16px;">
        <table role="presentation" class="hs-container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;">
          <tr>
            <td align="center" style="padding:36px 40px 28px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;letter-spacing:5px;color:#1A1A1A;text-transform:uppercase;">HOLYSHAPE</p>
            </td>
          </tr>
          <tr><td style="padding:0 40px;"><div style="height:1px;background:#D9C5B4;"></div></td></tr>
          <tr>
            <td class="hs-pad" align="center" style="padding:44px 56px 8px;">
              <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8B6F5C;font-weight:700;">Back in stock</p>
              <h1 class="hs-h1" style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:36px;line-height:1.15;color:#1A1A1A;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;">It's back.<br/>Don't miss it twice.</h1>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#6E6E6E;">You waited for it &mdash; and it's finally here again. The shapewear that stays put, smooths everything out, and disappears under your outfit. No riding up. No pinching.</p>
            </td>
          </tr>
          <tr>
            <td class="hs-pad" style="padding:32px 56px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFE7DD;border-radius:6px;">
                <tr>
                  <td align="center" style="padding:26px 28px;">
                    <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8B6F5C;font-weight:700;">Your item</p>
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.4;color:#1A1A1A;font-weight:700;">${productLabel}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="hs-pad" style="padding:30px 56px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;">
                <tr><td style="padding:7px 0;font-size:15px;color:#1A1A1A;line-height:1.5;"><span style="color:#8B6F5C;font-weight:700;">&#10003;</span>&nbsp;&nbsp;Doesn't ride up &mdash; stays exactly where you put it</td></tr>
                <tr><td style="padding:7px 0;font-size:15px;color:#1A1A1A;line-height:1.5;"><span style="color:#8B6F5C;font-weight:700;">&#10003;</span>&nbsp;&nbsp;Smooths everything out, no pinching</td></tr>
                <tr><td style="padding:7px 0;font-size:15px;color:#1A1A1A;line-height:1.5;"><span style="color:#8B6F5C;font-weight:700;">&#10003;</span>&nbsp;&nbsp;Breathable &amp; comfortable &mdash; you'll forget it's on</td></tr>
                <tr><td style="padding:7px 0;font-size:15px;color:#1A1A1A;line-height:1.5;"><span style="color:#8B6F5C;font-weight:700;">&#10003;</span>&nbsp;&nbsp;Invisible under your outfit</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="hs-pad" align="center" style="padding:34px 56px 10px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="background:#1A1A1A;border-radius:2px;">
                    <a href="${productUrl}" style="display:inline-block;padding:17px 56px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#ffffff;text-decoration:none;">Shop Now</a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6E6E6E;">Limited quantities &middot; Ships from Beirut, GCC &amp; Internationally</p>
            </td>
          </tr>
          <tr>
            <td class="hs-pad" style="padding:34px 56px 0;">
              <div style="height:1px;background:#EFE7DD;margin-bottom:22px;"></div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;">
                <tr>
                  <td align="center" width="33%" style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6E6E6E;line-height:1.5;">7-Day<br/>Return</td>
                  <td align="center" width="33%" style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6E6E6E;line-height:1.5;border-left:1px solid #EFE7DD;border-right:1px solid #EFE7DD;">Secure<br/>Payment</td>
                  <td align="center" width="33%" style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6E6E6E;line-height:1.5;">Free Shipping<br/>Over $60 (LB)</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="hs-pad" align="center" style="padding:36px 56px 40px;">
              <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:4px;text-transform:uppercase;color:#1A1A1A;font-weight:700;">HOLYSHAPE</p>
              <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:1px;color:#8B6F5C;text-transform:uppercase;">Sculpting Confidence</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6E6E6E;">
                <a href="https://instagram.com/holyshapestore" style="color:#6E6E6E;text-decoration:none;">Instagram</a>
                &nbsp;&middot;&nbsp;
                <a href="https://tiktok.com/@holyshapestore" style="color:#6E6E6E;text-decoration:none;">TikTok</a>
                &nbsp;&middot;&nbsp;
                <a href="https://holy-shape.com" style="color:#6E6E6E;text-decoration:none;">Website</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = { sendEmail };
