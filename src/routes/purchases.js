import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware to check auth
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Get user's purchases
router.get('/', requireAuth, async (req, res) => {
  try {
    // Extract user from auth header (you'll need to decode JWT in production)
    const authHeader = req.headers.authorization;
    const token = authHeader.split(' ')[1];
    
    // For now, return mock data
    const purchases = [
      {
        id: '1',
        campaign: {
          id: 'camp-1',
          name: 'Summer Marketing Campaign',
          description: 'Boost your summer sales',
          category: 'Seasonal',
          price: 299.99
        },
        purchased_at: new Date().toISOString(),
        status: 'active'
      }
    ];
    
    res.json(purchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get emails for a purchase
router.get('/:purchaseId/emails', requireAuth, async (req, res) => {
  try {
    const { purchaseId } = req.params;
    
    // Mock email data
    const emails = [
      {
        id: '1',
        subject: 'Welcome to Our Summer Campaign!',
        preview: 'Get ready for amazing summer deals...',
        content: '<h1>Summer is Here!</h1><p>Check out our latest offers...</p>',
        status: 'draft',
        created_at: new Date().toISOString()
      },
      {
        id: '2',
        subject: 'Mid-Summer Sale Announcement',
        preview: '50% off selected items...',
        content: '<h1>Big Summer Sale!</h1><p>Don\'t miss out...</p>',
        status: 'scheduled',
        scheduled_for: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString()
      }
    ];
    
    res.json(emails);
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update email content
router.put('/:purchaseId/emails/:emailId', requireAuth, async (req, res) => {
  try {
    const { purchaseId, emailId } = req.params;
    const { subject, content } = req.body;
    
    // In production, update the database
    // For now, return success
    res.json({ 
      success: true, 
      email: {
        id: emailId,
        subject,
        content,
        updated_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error updating email:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send test email
router.post('/:purchaseId/emails/:emailId/test', requireAuth, async (req, res) => {
  try {
    const { purchaseId, emailId } = req.params;
    const { testEmail } = req.body;
    
    // Here you would integrate with the email service
    // For now, return success
    res.json({ 
      success: true, 
      message: `Test email sent to ${testEmail}`
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;