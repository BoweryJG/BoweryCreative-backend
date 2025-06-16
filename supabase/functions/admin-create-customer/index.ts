import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

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

    const { userId, email, name, metadata } = await req.json()

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: {
        supabase_user_id: userId,
        ...metadata,
      },
    })

    // Save Stripe customer ID to database
    const { error: dbError } = await supabaseAdmin
      .from('customers')
      .insert({
        id: userId,
        stripe_customer_id: customer.id,
      })

    if (dbError) {
      // If the customer already exists, update it
      const { error: updateError } = await supabaseAdmin
        .from('customers')
        .update({ stripe_customer_id: customer.id })
        .eq('id', userId)

      if (updateError) {
        throw updateError
      }
    }

    // Update profile with billing information
    if (metadata?.monthly_billing) {
      await supabaseAdmin
        .from('profiles')
        .update({
          monthly_billing: parseFloat(metadata.monthly_billing),
          billing_cycle: metadata.billing_cycle || 'monthly',
        })
        .eq('id', userId)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        customer_id: customer.id 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error creating customer:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})