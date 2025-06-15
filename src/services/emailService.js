import { createTransport } from 'nodemailer';
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

class EmailOrchestrator {
  constructor() {
    this.accounts = [];
    this.currentAccountIndex = 0;
    this.dailySendCounts = new Map();
    this.postalEnabled = false;
    this.postalTransporter = null;
    this.initializeAccounts();
    this.initializePostal();
    this.startDailyReset();
  }

  initializeAccounts() {
    // Load Gmail accounts from environment variables
    let accountIndex = 1;
    while (process.env[`GMAIL_EMAIL_${accountIndex}`]) {
      const email = process.env[`GMAIL_EMAIL_${accountIndex}`];
      const password = process.env[`GMAIL_APP_PASSWORD_${accountIndex}`];
      
      if (email && password) {
        try {
          const transporter = createTransport({
            service: 'gmail',
            auth: {
              user: email,
              pass: password
            }
          });

          // Determine if it's a Google Workspace account
          const isWorkspace = !email.endsWith('@gmail.com');
          const dailyLimit = isWorkspace ? 2000 : 500;

          this.accounts.push({
            email,
            transporter,
            dailyLimit,
            isWorkspace
          });

          // Initialize daily count
          this.dailySendCounts.set(email, 0);

          console.log(`✅ Initialized ${email} (${isWorkspace ? 'Google Workspace' : 'Gmail'}: ${dailyLimit}/day)`);
        } catch (error) {
          console.error(`Failed to initialize ${email}:`, error.message);
        }
      }
      accountIndex++;
    }

    if (this.accounts.length === 0) {
      console.warn('⚠️  No email accounts configured! Add GMAIL_EMAIL_1 and GMAIL_APP_PASSWORD_1 to .env');
    } else {
      const totalCapacity = this.accounts.reduce((sum, acc) => sum + acc.dailyLimit, 0);
      console.log(`📧 Total daily email capacity: ${totalCapacity} emails/day`);
    }
  }

  initializePostal() {
    const postalHost = process.env.POSTAL_HOST;
    const postalPort = process.env.POSTAL_PORT || 25;
    const postalApiKey = process.env.POSTAL_API_KEY;

    if (postalHost && postalApiKey) {
      try {
        this.postalTransporter = createTransport({
          host: postalHost,
          port: parseInt(postalPort),
          secure: false,
          auth: {
            user: 'apikey',
            pass: postalApiKey
          },
          tls: {
            rejectUnauthorized: false
          }
        });
        this.postalEnabled = true;
        console.log('✅ Postal server initialized (UNLIMITED emails!)');
      } catch (error) {
        console.error('Failed to initialize Postal:', error.message);
      }
    }
  }

  startDailyReset() {
    // Reset counts at midnight
    cron.schedule('0 0 * * *', () => {
      console.log('🔄 Resetting daily email counts');
      this.dailySendCounts.clear();
      this.accounts.forEach(account => {
        this.dailySendCounts.set(account.email, 0);
      });
    });
  }

  getNextAccount() {
    if (this.accounts.length === 0) return null;

    // Find an account that hasn't hit its daily limit
    for (let i = 0; i < this.accounts.length; i++) {
      const account = this.accounts[this.currentAccountIndex];
      const sentToday = this.dailySendCounts.get(account.email) || 0;
      
      if (sentToday < account.dailyLimit) {
        return account;
      }
      
      // Move to next account
      this.currentAccountIndex = (this.currentAccountIndex + 1) % this.accounts.length;
    }
    
    // All accounts maxed out
    return null;
  }

  async sendEmail(options) {
    const {
      from,
      to,
      subject,
      html,
      text,
      replyTo,
      headers = {},
      attachments = [],
      usePostal = false
    } = options;

    try {
      // If Postal is enabled and requested, use it
      if (usePostal && this.postalEnabled) {
        return this.sendViaPostal(options);
      }

      // Get next available Gmail account
      const account = this.getNextAccount();
      if (!account) {
        if (this.postalEnabled) {
          console.log('Gmail accounts maxed out, falling back to Postal');
          return this.sendViaPostal(options);
        }
        throw new Error('All email accounts have reached their daily limits');
      }

      // Prepare email options
      const mailOptions = {
        from: from || `"Bowery Creative" <${account.email}>`,
        to,
        subject,
        html,
        text: text || this.htmlToText(html),
        replyTo: replyTo || account.email,
        headers: {
          'X-Mailer': 'Bowery Creative Email System',
          'X-Sent-Via': account.email,
          ...headers
        },
        attachments
      };

      // Send email
      const info = await account.transporter.sendMail(mailOptions);
      
      // Update count
      const currentCount = this.dailySendCounts.get(account.email) || 0;
      this.dailySendCounts.set(account.email, currentCount + 1);
      
      // Move to next account for round-robin
      this.currentAccountIndex = (this.currentAccountIndex + 1) % this.accounts.length;
      
      // Log to database
      await this.logEmail({
        message_id: info.messageId,
        from_email: from || account.email,
        to_email: to,
        subject,
        status: 'sent',
        sent_via: account.email,
        sent_at: new Date().toISOString()
      });

      return {
        success: true,
        messageId: info.messageId,
        sentBy: account.email,
        remainingToday: account.dailyLimit - (this.dailySendCounts.get(account.email) || 0)
      };

    } catch (error) {
      console.error('Email send error:', error);
      
      // Log failure
      await this.logEmail({
        from_email: from,
        to_email: to,
        subject,
        status: 'failed',
        error: error.message,
        sent_at: new Date().toISOString()
      });

      throw error;
    }
  }

  async sendViaPostal(options) {
    if (!this.postalEnabled) {
      throw new Error('Postal server is not configured');
    }

    const mailOptions = {
      from: options.from || '"Bowery Creative" <noreply@bowerycreativeagency.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || this.htmlToText(options.html),
      replyTo: options.replyTo,
      headers: {
        'X-Mailer': 'Bowery Creative Postal Server',
        ...options.headers
      },
      attachments: options.attachments
    };

    const info = await this.postalTransporter.sendMail(mailOptions);

    await this.logEmail({
      message_id: info.messageId,
      from_email: options.from || 'noreply@bowerycreativeagency.com',
      to_email: options.to,
      subject: options.subject,
      status: 'sent',
      sent_via: 'postal',
      sent_at: new Date().toISOString()
    });

    return {
      success: true,
      messageId: info.messageId,
      sentBy: 'postal',
      remainingToday: 'unlimited'
    };
  }

  async sendAsClient(clientEmail, clientName, recipientEmail, subject, body) {
    // This appears as if the client sent the email
    return this.sendEmail({
      from: `"${clientName}" <${clientEmail}>`,
      to: recipientEmail,
      subject,
      html: body,
      replyTo: clientEmail,
      headers: {
        'Return-Path': clientEmail,
        'X-Original-Sender': clientEmail
      }
    });
  }

  async sendBulk(emails, delayBetween = 5000) {
    const results = [];
    
    for (const [index, email] of emails.entries()) {
      try {
        const result = await this.sendEmail(email);
        results.push({ ...result, index });
        
        // Delay between sends (except for last email)
        if (index < emails.length - 1 && delayBetween > 0) {
          await new Promise(resolve => setTimeout(resolve, delayBetween));
        }
      } catch (error) {
        results.push({
          success: false,
          index,
          error: error.message
        });
      }
    }
    
    return results;
  }

  async createCampaign(name, recipients, subject, htmlTemplate, schedule) {
    // Store campaign in database
    const { data: campaign, error } = await supabase
      .from('email_campaigns')
      .insert({
        name,
        recipients,
        subject,
        html_template: htmlTemplate,
        schedule,
        status: 'scheduled',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Schedule the campaign sends
    schedule.forEach((scheduledSend, index) => {
      const sendTime = new Date(scheduledSend.sendAt);
      const now = new Date();
      
      if (sendTime > now) {
        const delay = sendTime - now;
        setTimeout(async () => {
          await this.executeCampaignSend(campaign.id, index);
        }, delay);
      }
    });

    return campaign;
  }

  async executeCampaignSend(campaignId, scheduleIndex) {
    const { data: campaign } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (!campaign) return;

    const results = [];
    for (const recipient of campaign.recipients) {
      // Replace template variables
      let html = campaign.html_template;
      Object.keys(recipient).forEach(key => {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), recipient[key]);
      });

      try {
        await this.sendEmail({
          to: recipient.email,
          subject: campaign.subject.replace(/{{(\w+)}}/g, (match, key) => recipient[key] || match),
          html
        });
        results.push({ email: recipient.email, success: true });
      } catch (error) {
        results.push({ email: recipient.email, success: false, error: error.message });
      }
    }

    // Update campaign status
    await supabase
      .from('email_campaigns')
      .update({
        [`send_${scheduleIndex}_completed`]: new Date().toISOString(),
        [`send_${scheduleIndex}_results`]: results
      })
      .eq('id', campaignId);
  }

  async logEmail(emailData) {
    try {
      await supabase
        .from('email_logs')
        .insert(emailData);
    } catch (error) {
      console.error('Failed to log email:', error);
    }
  }

  htmlToText(html) {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  async getStats() {
    const stats = {
      accounts: this.accounts.map(account => ({
        email: account.email,
        type: account.isWorkspace ? 'Google Workspace' : 'Gmail',
        sentToday: this.dailySendCounts.get(account.email) || 0,
        remainingToday: account.dailyLimit - (this.dailySendCounts.get(account.email) || 0),
        dailyLimit: account.dailyLimit
      })),
      postalEnabled: this.postalEnabled,
      totalSentToday: Array.from(this.dailySendCounts.values()).reduce((a, b) => a + b, 0),
      totalDailyCapacity: this.accounts.reduce((sum, acc) => sum + acc.dailyLimit, 0)
    };

    if (this.postalEnabled) {
      stats.totalDailyCapacity = 'unlimited';
    }

    return stats;
  }
}

// Export singleton instance
export const emailService = new EmailOrchestrator();

// Export convenience functions
export const sendEmail = (options) => emailService.sendEmail(options);
export const sendAsClient = (clientEmail, clientName, recipientEmail, subject, body) => 
  emailService.sendAsClient(clientEmail, clientName, recipientEmail, subject, body);
export const sendBulk = (emails, delayBetween) => emailService.sendBulk(emails, delayBetween);
export const createCampaign = (name, recipients, subject, htmlTemplate, schedule) =>
  emailService.createCampaign(name, recipients, subject, htmlTemplate, schedule);
export const getEmailStats = () => emailService.getStats();