import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Database types
export interface MagicLink {
  id: string;
  token: string;
  email: string;
  practice_name: string;
  expires_at: string;
  used: boolean;
  created_at: string;
}

export interface ConnectedAccount {
  id: string;
  practice_id: string;
  platform: 'facebook' | 'instagram';
  account_id: string;
  account_name: string;
  access_token: string; // Encrypted
  permissions: string[];
  expires_at: string;
  created_at: string;
}

export interface PostQueue {
  id: string;
  practice_id: string;
  account_id: string;
  content: string;
  media_urls?: string[];
  scheduled_for?: string;
  status: 'pending' | 'posted' | 'failed';
  posted_at?: string;
  post_id?: string;
  error?: string;
  created_at: string;
}