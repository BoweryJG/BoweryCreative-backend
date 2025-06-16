-- Add API usage tracking columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS api_usage_tracked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS monthly_billing DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);

-- Create API usage tracking table
CREATE TABLE IF NOT EXISTS public.api_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  request_count INTEGER DEFAULT 1,
  response_time_ms INTEGER,
  status_code INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create daily API usage summary table for billing
CREATE TABLE IF NOT EXISTS public.api_usage_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  usage_date DATE NOT NULL,
  total_requests INTEGER DEFAULT 0,
  billable_requests INTEGER DEFAULT 0,
  total_compute_ms INTEGER DEFAULT 0,
  endpoints_used JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(customer_id, usage_date)
);

-- Create API usage limits table
CREATE TABLE IF NOT EXISTS public.api_usage_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL UNIQUE,
  monthly_request_limit INTEGER DEFAULT 10000,
  daily_request_limit INTEGER DEFAULT 1000,
  rate_limit_per_minute INTEGER DEFAULT 100,
  overage_rate DECIMAL(10,4) DEFAULT 0.01, -- Cost per request over limit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for api_usage
CREATE POLICY "Users can view own API usage" ON public.api_usage
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.customers
      WHERE customers.id = auth.uid()
      AND customers.id = api_usage.customer_id
    )
  );

-- RLS Policies for api_usage_daily
CREATE POLICY "Users can view own daily API usage" ON public.api_usage_daily
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.customers
      WHERE customers.id = auth.uid()
      AND customers.id = api_usage_daily.customer_id
    )
  );

-- RLS Policies for api_usage_limits
CREATE POLICY "Users can view own API limits" ON public.api_usage_limits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.customers
      WHERE customers.id = auth.uid()
      AND customers.id = api_usage_limits.customer_id
    )
  );

-- Create indexes for performance
CREATE INDEX idx_api_usage_customer_id ON public.api_usage(customer_id);
CREATE INDEX idx_api_usage_created_at ON public.api_usage(created_at);
CREATE INDEX idx_api_usage_daily_customer_date ON public.api_usage_daily(customer_id, usage_date);

-- Create function to update daily usage summary
CREATE OR REPLACE FUNCTION public.update_api_usage_daily()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.api_usage_daily (
    customer_id,
    usage_date,
    total_requests,
    billable_requests,
    total_compute_ms,
    endpoints_used
  ) VALUES (
    NEW.customer_id,
    DATE(NEW.created_at),
    1,
    1,
    COALESCE(NEW.response_time_ms, 0),
    jsonb_build_object(NEW.endpoint, 1)
  )
  ON CONFLICT (customer_id, usage_date) 
  DO UPDATE SET
    total_requests = api_usage_daily.total_requests + 1,
    billable_requests = api_usage_daily.billable_requests + 1,
    total_compute_ms = api_usage_daily.total_compute_ms + COALESCE(NEW.response_time_ms, 0),
    endpoints_used = api_usage_daily.endpoints_used || 
      jsonb_build_object(
        NEW.endpoint, 
        COALESCE((api_usage_daily.endpoints_used->NEW.endpoint)::int, 0) + 1
      ),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update daily usage
CREATE TRIGGER update_daily_usage_on_api_call
  AFTER INSERT ON public.api_usage
  FOR EACH ROW
  EXECUTE FUNCTION public.update_api_usage_daily();

-- Create function to check API rate limits
CREATE OR REPLACE FUNCTION public.check_api_rate_limit(
  p_customer_id UUID,
  p_endpoint VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_limits RECORD;
  v_daily_usage INTEGER;
  v_minute_usage INTEGER;
BEGIN
  -- Get customer limits
  SELECT * INTO v_limits
  FROM public.api_usage_limits
  WHERE customer_id = p_customer_id;
  
  -- If no limits set, use defaults (allowing access)
  IF NOT FOUND THEN
    RETURN TRUE;
  END IF;
  
  -- Check daily limit
  SELECT total_requests INTO v_daily_usage
  FROM public.api_usage_daily
  WHERE customer_id = p_customer_id
  AND usage_date = CURRENT_DATE;
  
  IF COALESCE(v_daily_usage, 0) >= v_limits.daily_request_limit THEN
    RETURN FALSE;
  END IF;
  
  -- Check rate limit per minute
  SELECT COUNT(*) INTO v_minute_usage
  FROM public.api_usage
  WHERE customer_id = p_customer_id
  AND created_at >= NOW() - INTERVAL '1 minute';
  
  IF v_minute_usage >= v_limits.rate_limit_per_minute THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Update triggers
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.api_usage_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.api_usage_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();