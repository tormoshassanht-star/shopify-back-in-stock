// Resend HTTP API — Railway blocks outbound SMTP, so we can't use nodemailer
async function sendEmail(subscriber, productUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    const msg = 'RESEND_API_KEY or EMAIL_FROM not configured';
    console.error(`[${new Date().toISOString()}] Email: ${msg}`);
    return { success: false, error: msg };
  }

  const variantLabel = subscriber.variant_title && subscriber.variant_title !== 'Default Title'
    ? ` — ${subscriber.variant_title}`
    : '';

  const subject = `✅ ${subscriber.product_title} is back in stock!`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a1a;padding:32px 40px;text-align:center;">
              <p style="color:#ffffff;font-size:24px;font-weight:bold;margin:0;">
                Back in Stock! 🎉
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="font-size:16px;color:#333333;line-height:1.6;margin:0 0 16px;">
                Great news! The item you were waiting for is available again.
              </p>
              <table cellpadding="0" cellspacing="0"
                     style="background:#f9f9f9;border-radius:6px;padding:20px;width:100%;margin:0 0 24px;">
                <tr>
                  <td>
                    <p style="margin:0 0 6px;font-size:18px;font-weight:bold;color:#1a1a1a;">
                      ${subscriber.product_title}
                    </p>
                    ${variantLabel ? `<p style="margin:0;font-size:14px;color:#666666;">${subscriber.variant_title}</p>` : ''}
                  </td>
                </tr>
              </table>
              <p style="font-size:15px;color:#555555;line-height:1.6;margin:0 0 28px;">
                Hurry — popular items sell out fast. Grab yours before it's gone!
              </p>
              <!-- CTA Button -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td align="center"
                      style="background:#1a1a1a;border-radius:6px;padding:14px 36px;">
                    <a href="${productUrl}"
                       style="color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;display:block;">
                      Shop Now →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #eeeeee;">
              <p style="font-size:12px;color:#999999;margin:0;line-height:1.6;">
                You received this email because you signed up for back-in-stock alerts on
                <strong>${subscriber.store_domain || 'our store'}</strong>.
                If you no longer wish to receive these notifications, no further action is needed —
                each alert is sent only once per item.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ from, to: subscriber.contact, subject, html }),
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

module.exports = { sendEmail };
