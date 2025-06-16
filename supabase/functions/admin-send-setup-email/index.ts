import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    
    // Verify admin user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if user is admin
    const adminEmails = ['jasonwilliamgolden@gmail.com', 'jgolden@bowerycreativeagency.com']
    if (!adminEmails.includes(user.email?.toLowerCase() || '')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { email, name, setupLink } = await req.json()

    // Create magic link for billing setup
    const { data: magicLink, error: magicLinkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: setupLink || `${Deno.env.get('SITE_URL')}/setup-billing`,
      }
    })

    if (magicLinkError) {
      throw magicLinkError
    }

    // Send email using Resend
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Bowery Creative <billing@bowerycreativeagency.com>',
        to: [email],
        subject: 'Welcome to Bowery Creative - Set Up Your Billing',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background-color: #1a1a1a; color: white; padding: 30px; text-align: center; }
                .content { background-color: #f9f9f9; padding: 30px; }
                .button { 
                  display: inline-block; 
                  padding: 15px 30px; 
                  background-color: #D4AF37; 
                  color: #1a1a1a; 
                  text-decoration: none; 
                  border-radius: 5px; 
                  font-weight: bold;
                  margin: 20px 0;
                }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Welcome to Bowery Creative</h1>
                </div>
                <div class="content">
                  <h2>Hi ${name},</h2>
                  <p>Thank you for choosing Bowery Creative as your creative partner. We're excited to work with you!</p>
                  <p>To get started, please set up your billing information by clicking the button below:</p>
                  <div style="text-align: center;">
                    <a href="${magicLink.properties?.action_link}" class="button">Set Up Billing</a>
                  </div>
                  <p>This secure link will allow you to:</p>
                  <ul>
                    <li>Add your payment method</li>
                    <li>Review your subscription details</li>
                    <li>Access your customer portal</li>
                  </ul>
                  <p>If you have any questions, please don't hesitate to reach out to us at support@bowerycreativeagency.com</p>
                  <p>Best regards,<br>The Bowery Creative Team</p>
                </div>
                <div class="footer">
                  <p>© 2025 Bowery Creative Agency. All rights reserved.</p>
                  <p>This link expires in 24 hours for security reasons.</p>
                </div>
              </div>
            </body>
          </html>
        `,
      }),
    })

    if (!emailResponse.ok) {
      const error = await emailResponse.text()
      throw new Error(`Failed to send email: ${error}`)
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Setup email sent successfully'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error sending setup email:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})