import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    const { email } = await req.json()

    // Validate email
    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Check if already subscribed
    const { data: existing } = await supabaseClient
      .from('subscribers')
      .select('id, status')
      .eq('email', email)
      .single()

    if (existing) {
      if (existing.status === 'active') {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'You are already subscribed!' 
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        )
      } else {
        // Reactivate subscription
        await supabaseClient
          .from('subscribers')
          .update({ status: 'active' })
          .eq('id', existing.id)
      }
    } else {
      // Insert new subscriber
      const { error } = await supabaseClient
        .from('subscribers')
        .insert({
          email,
          source: 'website',
          metadata: {
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            user_agent: req.headers.get('user-agent'),
          }
        })

      if (error) throw error
    }

    // TODO: Add to email marketing service (e.g., SendGrid, Mailchimp)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Successfully subscribed to our newsletter!' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})