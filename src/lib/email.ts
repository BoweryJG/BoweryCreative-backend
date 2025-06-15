import nodemailer from 'nodemailer';

// Using SMTP for now - can switch to SendGrid/Resend later
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export async function sendMagicLink(email: string, practiceName: string, magicUrl: string) {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .logo { font-size: 24px; font-weight: bold; color: #007F80; margin-bottom: 30px; }
    .content { background: #f7f7f7; padding: 40px; border-radius: 8px; }
    h2 { color: #333; margin-bottom: 20px; }
    p { color: #666; line-height: 1.6; margin-bottom: 20px; }
    .button { 
      display: inline-block; 
      background: #007F80; 
      color: white; 
      padding: 14px 32px; 
      text-decoration: none; 
      border-radius: 6px; 
      font-weight: 600;
      margin: 20px 0;
    }
    .footer { margin-top: 40px; color: #999; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">⚡ BoweryCreative</div>
    <div class="content">
      <h2>Connect Your Social Media Accounts</h2>
      <p>Hi ${practiceName},</p>
      <p>Click the button below to securely connect your Facebook and Instagram accounts for automated posting:</p>
      <a href="${magicUrl}" class="button">Connect Accounts</a>
      <p><small>This link expires in 24 hours for security.</small></p>
    </div>
    <div class="footer">
      <p>You received this email because someone requested to connect ${practiceName} to BoweryCreative.</p>
    </div>
  </div>
</body>
</html>
  `;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'magic@bowerycreative.com',
    to: email,
    subject: '⚡ Connect Your Social Media - BoweryCreative',
    html
  });
}