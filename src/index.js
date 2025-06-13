import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import Parser from 'rss-parser';
import NodeCache from 'node-cache';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize cache for API responses
const cache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

// Initialize RSS parser
const parser = new Parser({
  timeout: 10000,
  requestOptions: {
    rejectUnauthorized: false
  }
});

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware
app.use(cors({
  origin: [
    'https://bowerycreative.netlify.app',
    'http://localhost:5173',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());

// API Key authentication middleware
const authenticateAPI = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (process.env.API_KEY && apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create new contact (from contact form)
app.post('/api/contacts', authenticateAPI, async (req, res) => {
  try {
    const contactData = req.body;
    
    // Check for duplicate submissions in last 24 hours
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('email', contactData.email)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(409).json({ 
        error: 'Duplicate submission',
        message: 'Contact already exists' 
      });
    }

    // Create contact
    const { data, error } = await supabase
      .from('contacts')
      .insert([{
        ...contactData,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get contact submissions (admin only)
app.get('/api/contacts', authenticateAPI, async (req, res) => {
  try {
    const { status, leadScoreMin, assignedTo, tags } = req.query;
    
    let query = supabase.from('contacts').select('*');
    
    if (status) query = query.eq('status', status);
    if (leadScoreMin) query = query.gte('lead_score', leadScoreMin);
    if (assignedTo) query = query.eq('assigned_to', assignedTo);
    if (tags) query = query.contains('tags', tags.split(','));
    
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single contact
app.get('/api/contacts/:id', authenticateAPI, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', req.params.id)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update contact
app.put('/api/contacts/:id', authenticateAPI, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get analytics
app.get('/api/analytics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let query = supabase
      .from('analytics')
      .select('*');

    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Track analytics event
app.post('/api/analytics', async (req, res) => {
  try {
    const { event_type, page_path, referrer } = req.body;
    
    const { data, error } = await supabase
      .from('analytics')
      .insert({
        event_type,
        page_path,
        referrer,
        user_agent: req.headers['user-agent'],
        ip_address: req.ip,
        session_id: req.body.session_id,
        metadata: req.body.metadata || {}
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Onboarding API
app.post('/api/onboarding/start', authenticateAPI, async (req, res) => {
  try {
    const { contactId } = req.body;
    
    // Create project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert([{
        contact_id: contactId,
        name: 'New Project',
        status: 'lead',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (projectError) throw projectError;
    
    // Create onboarding steps
    const steps = [
      { step_name: 'qualification', step_type: 'form', order_index: 0 },
      { step_name: 'packages', step_type: 'form', order_index: 1 },
      { step_name: 'proposal', step_type: 'document', order_index: 2 },
      { step_name: 'contract', step_type: 'document', order_index: 3 },
      { step_name: 'payment', step_type: 'payment', order_index: 4 },
      { step_name: 'kickoff', step_type: 'meeting', order_index: 5 }
    ];
    
    const onboardingSteps = steps.map(step => ({
      contact_id: contactId,
      project_id: project.id,
      ...step,
      status: 'not_started',
      created_at: new Date().toISOString()
    }));
    
    const { data: createdSteps, error: stepsError } = await supabase
      .from('onboarding_steps')
      .insert(onboardingSteps)
      .select();
    
    if (stepsError) throw stepsError;
    
    res.json({ projectId: project.id, steps: createdSteps });
  } catch (error) {
    console.error('Error starting onboarding:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/onboarding/contacts/:contactId/steps', authenticateAPI, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('onboarding_steps')
      .select('*')
      .eq('contact_id', req.params.contactId)
      .order('order_index');
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/onboarding/steps/:stepId/complete', authenticateAPI, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('onboarding_steps')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        form_data: req.body
      })
      .eq('id', req.params.stepId)
      .select()
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Email API (using Resend when configured)
app.post('/api/emails/send', authenticateAPI, async (req, res) => {
  try {
    const { templateId, to, variables } = req.body;
    
    // For now, just log the email request
    console.log('Email request:', { templateId, to, variables });
    
    // When Resend is configured, add the actual sending logic here
    if (process.env.RESEND_API_KEY) {
      // TODO: Implement Resend email sending
    }
    
    res.json({ success: true, messageId: `mock-${Date.now()}` });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: error.message });
  }
});

// Service packages API
app.get('/api/services/packages', authenticateAPI, async (req, res) => {
  try {
    const { category, isActive = true } = req.query;
    
    let query = supabase
      .from('service_packages')
      .select('*')
      .eq('is_active', isActive === 'true');
    
    if (category) query = query.eq('category', category);
    
    const { data, error } = await query.order('display_order');
    
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analytics dashboard API
app.get('/api/analytics/dashboard', authenticateAPI, async (req, res) => {
  try {
    // Total contacts
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true });
    
    // Active projects
    const { count: activeProjects } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .in('status', ['in_progress', 'contract_signed']);
    
    // Simple metrics for now
    res.json({
      totalContacts: totalContacts || 0,
      activeProjects: activeProjects || 0,
      revenue: {
        total: 0,
        monthly: 0,
        growth: 0
      },
      conversionRate: 0,
      averageProjectValue: 0,
      upcomingMilestones: []
    });
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Podcast feed endpoints
// RSS Feed Parser endpoint
app.post('/api/feeds/rss', async (req, res) => {
  try {
    const { feedUrl, feedName, category, maxEpisodes = 3 } = req.body;
    
    if (!feedUrl) {
      return res.status(400).json({
        success: false,
        error: 'Feed URL is required'
      });
    }

    const cacheKey = `rss-feed-${Buffer.from(feedUrl).toString('base64')}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Parse RSS feed with error handling
    let feed;
    try {
      feed = await parser.parseURL(feedUrl);
    } catch (parseError) {
      console.warn(`Failed to parse RSS feed ${feedUrl}:`, parseError.message);
      // Return empty array for invalid feeds instead of throwing error
      return res.json([]);
    }
    
    // Process episodes
    const episodes = feed.items.slice(0, maxEpisodes).map((item, index) => {
      // Check if episode is live (published within 24 hours)
      const pubDate = new Date(item.pubDate || item.isoDate);
      const now = new Date();
      const isLive = !isNaN(pubDate.getTime()) && (now - pubDate) < 24 * 60 * 60 * 1000;
      
      // Extract audio URL from enclosure
      let audioUrl = null;
      if (item.enclosure && item.enclosure.url) {
        audioUrl = item.enclosure.url;
      } else if (item.link) {
        audioUrl = item.link;
      }
      
      // Extract duration if available
      let duration = null;
      if (item.itunes && item.itunes.duration) {
        // Convert duration to seconds
        const durationStr = item.itunes.duration;
        const parts = durationStr.split(':');
        if (parts.length === 3) {
          duration = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        } else if (parts.length === 2) {
          duration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        }
      }

      return {
        id: `${feedName}-${index}-${Date.now()}`,
        title: item.title || 'Untitled Episode',
        author: item.creator || feed.title || feedName,
        description: item.contentSnippet || item.content || item.summary || 'No description available',
        pubDate: item.pubDate || item.isoDate,
        audioUrl: audioUrl,
        duration: duration,
        image: item.itunes?.image || feed.image?.url || `https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=300`,
        isLive: isLive
      };
    });

    const result = episodes;
    
    // Cache for 30 minutes
    cache.set(cacheKey, result, 1800);
    
    res.json(result);
  } catch (error) {
    console.error('Error parsing RSS feed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to parse RSS feed',
      details: error.message
    });
  }
});

// Apple Podcasts search endpoint
app.post('/api/feeds/apple', async (req, res) => {
  try {
    const { searchTerm, limit = 15 } = req.body;
    
    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        error: 'Search term is required'
      });
    }

    const cacheKey = `apple-podcasts-${Buffer.from(searchTerm).toString('base64')}-${limit}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Use iTunes Search API
    const response = await axios.get('https://itunes.apple.com/search', {
      params: {
        term: searchTerm,
        entity: 'podcast',
        limit: limit,
        media: 'podcast'
      },
      timeout: 10000
    });

    const podcasts = response.data.results.map(podcast => ({
      id: podcast.trackId || podcast.collectionId,
      title: podcast.trackName || podcast.collectionName,
      author: podcast.artistName,
      description: podcast.description || 'No description available',
      image: podcast.artworkUrl600 || podcast.artworkUrl100,
      sourceUrl: podcast.trackViewUrl || podcast.collectionViewUrl,
      genre: podcast.primaryGenreName,
      episodeCount: podcast.trackCount,
      rating: podcast.averageUserRating,
      releaseDate: podcast.releaseDate
    }));

    // Cache for 1 hour
    cache.set(cacheKey, podcasts, 3600);
    
    res.json(podcasts);
  } catch (error) {
    console.error('Error searching Apple Podcasts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search Apple Podcasts',
      details: error.message
    });
  }
});

// Trending podcasts endpoint
app.post('/api/feeds/trending', async (req, res) => {
  try {
    const { categories = ['medical', 'dental', 'healthcare', 'ai'], limit = 10 } = req.body;

    const cacheKey = `trending-podcasts-${categories.join('-')}-${limit}`;
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Mock trending data for now - can be replaced with real trending API
    const trendingPodcasts = [
      {
        id: 'trending-1',
        title: 'The Future of Telemedicine Post-COVID',
        author: 'Healthcare Horizons',
        description: 'Expert panel discusses permanent changes in healthcare delivery and what it means for patient care',
        image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=300',
        audioUrl: 'https://example.com/trending1.mp3',
        downloads: 15420,
        pubDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'trending-2',
        title: 'Robotics in Surgery: Year in Review',
        author: 'MedTech Weekly',
        description: 'Breakthrough robotic procedures that saved lives in 2024',
        image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=300',
        audioUrl: 'https://example.com/trending2.mp3',
        downloads: 12350,
        pubDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'trending-3',
        title: 'AI Diagnosis: Success Stories from the ER',
        author: 'Emergency Medicine Today',
        description: 'Real cases where AI-assisted diagnosis made the difference',
        image: 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=300',
        audioUrl: 'https://example.com/trending3.mp3',
        downloads: 11200,
        pubDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'trending-4',
        title: 'Dental Implants and 3D Printing Revolution',
        author: 'Digital Dentistry Podcast',
        description: 'How 3D printing is changing everything about dental implants',
        image: 'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?w=300',
        audioUrl: 'https://example.com/trending4.mp3',
        downloads: 9800,
        pubDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'trending-5',
        title: 'Mental Health Apps That Actually Work',
        author: 'Digital Health Review',
        description: 'Evidence-based mental health applications making real impact',
        image: 'https://images.unsplash.com/photo-1559757175-0eb30cd8c063?w=300',
        audioUrl: 'https://example.com/trending5.mp3',
        downloads: 8900,
        pubDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    const result = trendingPodcasts.slice(0, limit);
    
    // Cache for 2 hours
    cache.set(cacheKey, result, 7200);
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching trending podcasts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending podcasts',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});