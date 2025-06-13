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
app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get contact submissions (admin only)
app.get('/api/contacts', async (req, res) => {
  try {
    // TODO: Add authentication check
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false });

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

    // Parse RSS feed
    const feed = await parser.parseURL(feedUrl);
    
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