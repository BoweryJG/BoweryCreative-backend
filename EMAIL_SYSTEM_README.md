# 🚀 Bowery Creative Email System

## Overview
A powerful, unlimited email system for Bowery Creative with ZERO monthly fees. Send professional emails from multiple @bowerycreativeagency.com addresses.

## ✅ Current Setup

### Email Accounts
Configure these in your `.env` file:
```env
# Primary account (Google Workspace - 2,000/day)
GMAIL_EMAIL_1=jgolden@bowerycreativeagency.com
GMAIL_APP_PASSWORD_1=xxxx xxxx xxxx xxxx

# Add more accounts as needed:
# GMAIL_EMAIL_2=another@gmail.com
# GMAIL_APP_PASSWORD_2=xxxx xxxx xxxx xxxx
```

### Bowery Creative Email Aliases
The system includes 18+ professional aliases, all forwarding to `jgolden@bowerycreativeagency.com`:

- **Leadership**: jgolden@, jason@, emily@
- **General**: hello@, info@, team@
- **Departments**: support@, billing@, design@, development@, marketing@
- **Business**: projects@, newbusiness@, careers@, press@
- **Automated**: noreply@, notifications@

## 📧 API Endpoints

### Send Single Email
```bash
POST /api/emails/send
{
  "to": "client@example.com",
  "subject": "Your Project Update",
  "html": "<h1>Project Status</h1><p>Your project is on track!</p>",
  "from": "design@bowerycreativeagency.com"  # Optional
}
```

### Send as Bowery Alias
```bash
POST /api/emails/send-as-bowery
{
  "alias": "emily",  # Uses emily@bowerycreativeagency.com
  "to": "client@example.com",
  "subject": "Creative Brief Ready",
  "html": "<p>Your creative brief is attached.</p>",
  "includeSignature": true
}
```

### Send as Client
```bash
POST /api/emails/send-as-client
{
  "clientEmail": "ceo@clientcompany.com",
  "clientName": "John Smith",
  "recipientEmail": "investor@example.com",
  "subject": "Investment Opportunity",
  "body": "<p>I wanted to share this opportunity with you...</p>"
}
```

### Bulk Send
```bash
POST /api/emails/bulk
{
  "emails": [
    {"to": "client1@example.com", "subject": "Update 1", "html": "<p>Content 1</p>"},
    {"to": "client2@example.com", "subject": "Update 2", "html": "<p>Content 2</p>"}
  ],
  "delayBetween": 5000  # 5 seconds between sends
}
```

### Create Campaign
```bash
POST /api/emails/campaign
{
  "name": "Q1 Client Newsletter",
  "recipients": [
    {"email": "client1@example.com", "name": "Sarah Johnson", "company": "Tech Corp"},
    {"email": "client2@example.com", "name": "Mike Chen", "company": "Design Inc"}
  ],
  "subject": "{{name}}, Bowery Creative Q1 Updates",
  "htmlTemplate": "<p>Hi {{name}} from {{company}},</p><p>Here's what we've been working on...</p>",
  "schedule": [
    {"sendAt": "2024-01-15T09:00:00Z"},
    {"sendAt": "2024-01-22T09:00:00Z"}
  ]
}
```

### Get Statistics
```bash
GET /api/emails/stats

Response:
{
  "accounts": [
    {
      "email": "jgolden@bowerycreativeagency.com",
      "type": "Google Workspace",
      "sentToday": 42,
      "remainingToday": 1958,
      "dailyLimit": 2000
    }
  ],
  "totalSentToday": 42,
  "totalDailyCapacity": 2000
}
```

### List Available Aliases
```bash
GET /api/emails/aliases

Response:
{
  "domain": "bowerycreativeagency.com",
  "forwardTo": "jgolden@bowerycreativeagency.com",
  "aliases": [
    {"alias": "emily", "email": "emily@bowerycreativeagency.com", "name": "Emily Carter", "title": "Creative Director"},
    {"alias": "design", "email": "design@bowerycreativeagency.com", "name": "Bowery Design", "title": "Design Services"}
  ]
}
```

## 🧪 Testing

### Test Email System
```bash
# Test the email service
node test_bowery_emails.js

# Test via API
curl -X POST http://localhost:3001/api/emails/test \
  -H "Content-Type: application/json" \
  -d '{"email": "jgolden@bowerycreativeagency.com"}'
```

## 🗄️ Database Setup

Run the migration in Supabase SQL editor:
```bash
# Run: supabase/migrations/20250115_email_tables.sql
```

This creates:
- `email_logs` - Track all sent emails
- `email_campaigns` - Manage email campaigns
- `email_templates` - Store reusable templates

## 🐳 Postal Docker (Unlimited Emails)

### Quick Setup
```bash
# Run the setup script
./setup-postal.sh

# Start Postal
docker-compose up -d

# Access web UI: http://localhost:5000
# Login: admin@bowerycreativeagency.com / BoweryCreative2024!
```

### Enable in .env
```env
POSTAL_HOST=localhost
POSTAL_PORT=25
POSTAL_API_KEY=your-postal-api-key
```

## 🔧 Environment Variables

### Required
```env
# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-key

# Gmail Account
GMAIL_EMAIL_1=jgolden@bowerycreativeagency.com
GMAIL_APP_PASSWORD_1=xxxx xxxx xxxx xxxx

# Optional: API Key for email endpoints
EMAIL_API_KEY=your-secret-api-key
```

### Optional (for scaling)
```env
# Add more Gmail accounts
GMAIL_EMAIL_2=another@gmail.com
GMAIL_APP_PASSWORD_2=xxxx xxxx xxxx xxxx

# Postal server
POSTAL_HOST=localhost
POSTAL_PORT=25
POSTAL_API_KEY=your-postal-key
```

## 📈 Scaling Guide

### Current Capacity
- With 1 Google Workspace account: 2,000 emails/day
- Add Gmail accounts: +500/day each
- Add Google Workspace: +2,000/day each
- Enable Postal: UNLIMITED

### To Add More Accounts
1. Get app passwords for new Gmail accounts
2. Add to `.env`:
   ```env
   GMAIL_EMAIL_2=newaccount@gmail.com
   GMAIL_APP_PASSWORD_2=xxxx xxxx xxxx xxxx
   ```
3. Restart the server

## 🎯 Features

### Smart Account Rotation
- Automatically switches between accounts
- Tracks daily usage per account
- Prevents hitting limits

### Professional Aliases
- Send from any @bowerycreativeagency.com address
- Automatic email signatures
- All replies forward to main inbox

### Campaign Management
- Schedule multi-day drip campaigns
- Personalized templates with variables
- Track campaign progress

### Client Email Spoofing
- Send emails appearing as your clients
- Perfect for automations
- Full header control

## 💰 Cost Comparison

### Your Setup: $0/month
- Gmail/Google Workspace: Already have
- Postal: FREE (self-hosted)
- No monthly fees!

### Competitors:
- SendGrid: $20-100/month
- Mailgun: $35-80/month
- Amazon SES: Pay per email
- Mailchimp: $50-300/month

## 🚀 Production Deployment

### Deploy to Render
1. Push to GitHub:
   ```bash
   git add .
   git commit -m "Add email system"
   git push origin main
   ```

2. Add environment variables in Render dashboard
3. Gmail accounts work immediately
4. Postal requires VPS (optional)

## 🚨 Troubleshooting

### Email Not Sending
1. Check app passwords are correct (16 characters, no spaces)
2. Verify 2FA is enabled on Gmail accounts
3. Run test: `node test_bowery_emails.js`

### Daily Limit Hit
1. Add more Gmail accounts to `.env`
2. Enable Postal for unlimited
3. Check stats: `GET /api/emails/stats`

### Emails Going to Spam
1. Warm up new accounts gradually
2. Use professional content
3. Avoid spam trigger words
4. Set up SPF/DKIM records

## 📞 Support

- Test emails: Use `/api/emails/test` endpoint
- View logs: Check Supabase `email_logs` table
- Check stats: `GET /api/emails/stats`

---

Built for Bowery Creative Agency - Professional Email System with No Monthly Fees