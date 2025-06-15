import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware to check auth
const requireAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  
  // Check for Bearer token or API key
  if (!authHeader && !apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Get campaign analytics
router.get('/:campaignId/analytics', requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { startDate, endDate, metrics } = req.query;
    
    // Mock analytics data for now
    const analyticsData = {
      campaignId,
      dateRange: { startDate, endDate },
      metrics: {
        totalViews: Math.floor(Math.random() * 10000),
        uniqueVisitors: Math.floor(Math.random() * 5000),
        conversions: Math.floor(Math.random() * 500),
        revenue: Math.floor(Math.random() * 50000),
        clickThroughRate: (Math.random() * 10).toFixed(2),
        conversionRate: (Math.random() * 5).toFixed(2)
      },
      chartData: Array.from({ length: 7 }, (_, i) => ({
        date: new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        views: Math.floor(Math.random() * 1000),
        conversions: Math.floor(Math.random() * 100)
      }))
    };
    
    res.json(analyticsData);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Purchase a campaign
router.post('/:campaignId/purchase', requireAuth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { userId, paymentMethod } = req.body;
    
    // Create purchase record
    const { data: purchase, error } = await supabase
      .from('campaign_purchases')
      .insert({
        campaign_id: campaignId,
        user_id: userId,
        payment_method: paymentMethod,
        status: 'completed',
        purchased_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, purchase });
  } catch (error) {
    console.error('Error purchasing campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;