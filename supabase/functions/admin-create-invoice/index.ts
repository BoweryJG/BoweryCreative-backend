import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

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

    const { 
      customer_id, 
      customer_email, 
      customer_name,
      line_items, 
      due_date, 
      payment_terms,
      notes,
      send_email = true,
      status = 'sent'
    } = await req.json()

    // Get customer's Stripe ID
    const { data: customerData } = await supabaseAdmin
      .from('customers')
      .select('stripe_customer_id')
      .eq('id', customer_id)
      .single()

    let stripeInvoice = null
    
    if (customerData?.stripe_customer_id && send_email) {
      // Create Stripe invoice
      stripeInvoice = await stripe.invoices.create({
        customer: customerData.stripe_customer_id,
        collection_method: 'send_invoice',
        days_until_due: payment_terms === 'immediate' ? 0 : 
                        payment_terms === 'net15' ? 15 : 
                        payment_terms === 'net30' ? 30 : 60,
        metadata: {
          created_by: user.email,
          notes: notes || '',
        }
      })

      // Add line items to Stripe invoice
      for (const item of line_items) {
        await stripe.invoiceItems.create({
          customer: customerData.stripe_customer_id,
          invoice: stripeInvoice.id,
          description: item.description,
          quantity: item.quantity,
          unit_amount: Math.round(item.unit_price * 100), // Convert to cents
        })
      }

      // Finalize the invoice
      stripeInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id)
      
      // Send the invoice
      if (send_email && status === 'sent') {
        await stripe.invoices.sendInvoice(stripeInvoice.id)
      }
    }

    // Generate invoice number
    const { data: invoiceCount } = await supabaseAdmin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(new Date().getFullYear(), 0, 1).toISOString())

    const invoiceNumber = `INV-${new Date().getFullYear()}-${String((invoiceCount?.count || 0) + 1).padStart(5, '0')}`
    
    // Calculate total
    const totalAmount = line_items.reduce((sum: number, item: any) => 
      sum + (item.quantity * item.unit_price), 0
    )

    // Save invoice to database
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from('invoices')
      .insert({
        client_id: customer_id,
        invoice_number: invoiceNumber,
        stripe_invoice_id: stripeInvoice?.id,
        amount_due: totalAmount,
        currency: 'usd',
        status: status,
        due_date: due_date,
        line_items: line_items,
        metadata: {
          payment_terms,
          notes,
          created_by: user.email,
        }
      })
      .select()
      .single()

    if (invoiceError) {
      throw invoiceError
    }

    // Send custom email if not using Stripe or if requested
    if (send_email && (!customerData?.stripe_customer_id || status === 'sent')) {
      const paymentLink = stripeInvoice?.hosted_invoice_url || 
        `${Deno.env.get('SITE_URL')}/pay-invoice/${invoice.id}`

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'Bowery Creative <billing@bowerycreativeagency.com>',
          to: [customer_email],
          subject: `Invoice ${invoiceNumber} from Bowery Creative`,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <style>
                  body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { background-color: #1a1a1a; color: white; padding: 30px; text-align: center; }
                  .content { background-color: #f9f9f9; padding: 30px; }
                  .invoice-details { background-color: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
                  .line-items { width: 100%; border-collapse: collapse; margin: 20px 0; }
                  .line-items th { background-color: #f0f0f0; padding: 10px; text-align: left; }
                  .line-items td { padding: 10px; border-bottom: 1px solid #ddd; }
                  .total { text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px; }
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
                    <h1>Invoice ${invoiceNumber}</h1>
                  </div>
                  <div class="content">
                    <p>Dear ${customer_name},</p>
                    <p>Please find below the details of your invoice from Bowery Creative.</p>
                    
                    <div class="invoice-details">
                      <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
                      <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                      <p><strong>Due Date:</strong> ${new Date(due_date).toLocaleDateString()}</p>
                      <p><strong>Payment Terms:</strong> ${payment_terms.toUpperCase()}</p>
                    </div>
                    
                    <table class="line-items">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th>Quantity</th>
                          <th>Unit Price</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${line_items.map((item: any) => `
                          <tr>
                            <td>${item.description}</td>
                            <td>${item.quantity}</td>
                            <td>$${item.unit_price.toFixed(2)}</td>
                            <td>$${item.amount.toFixed(2)}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                    
                    <div class="total">
                      Total Due: $${totalAmount.toFixed(2)} USD
                    </div>
                    
                    ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
                    
                    <div style="text-align: center;">
                      <a href="${paymentLink}" class="button">Pay Invoice</a>
                    </div>
                    
                    <p>If you have any questions about this invoice, please contact us at billing@bowerycreativeagency.com</p>
                  </div>
                  <div class="footer">
                    <p>© 2025 Bowery Creative Agency. All rights reserved.</p>
                    <p>Thank you for your business!</p>
                  </div>
                </div>
              </body>
            </html>
          `,
        }),
      })

      if (!emailResponse.ok) {
        console.error('Failed to send invoice email:', await emailResponse.text())
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        invoice: {
          id: invoice.id,
          invoice_number: invoiceNumber,
          stripe_invoice_id: stripeInvoice?.id,
          hosted_invoice_url: stripeInvoice?.hosted_invoice_url,
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error creating invoice:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})