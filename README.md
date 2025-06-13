# Bowery Creative Backend

Backend services for Bowery Creative Agency website and podcast platform.

## Stack

- **Runtime**: Node.js (>=18.0.0)
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Edge Functions**: Supabase Edge Functions (Deno)
- **Storage**: Supabase Storage
- **Deployment**: Render.com

## Setup

1. Install Supabase CLI:
```bash
brew install supabase/tap/supabase
```

2. Create a Supabase project at https://supabase.com

3. Copy `.env.local` to `.env` and fill in your credentials:
```bash
cp .env.local .env
```

4. Link to your Supabase project:
```bash
supabase link --project-ref your-project-ref
```

5. Run migrations:
```bash
supabase db push
```

## Development

Install dependencies:
```bash
npm install
```

Run development server:
```bash
npm run dev
```

Start local Supabase:
```bash
supabase start
```

Stop local Supabase:
```bash
supabase stop
```

## Database Schema

- `profiles` - User profiles
- `contacts` - Contact form submissions
- `campaigns` - Marketing campaigns
- `analytics` - Site analytics

## Edge Functions

- `/contact` - Handle contact form submissions
- `/subscribe` - Newsletter subscriptions
- `/analytics` - Track page views

## API Endpoints

### Analytics
- `GET /api/analytics` - Get analytics data
- `POST /api/analytics` - Track analytics event

### Contacts
- `GET /api/contacts` - Get contact submissions (admin only)

### Podcast Feeds
- `POST /api/feeds/rss` - Parse RSS podcast feeds
  ```json
  {
    "feedUrl": "https://example.com/podcast.rss",
    "feedName": "Podcast Name",
    "category": "medical",
    "maxEpisodes": 3
  }
  ```

- `POST /api/feeds/apple` - Search Apple Podcasts
  ```json
  {
    "searchTerm": "medical dental healthcare podcast",
    "limit": 15
  }
  ```

- `POST /api/feeds/trending` - Get trending podcasts
  ```json
  {
    "categories": ["medical", "dental", "healthcare", "ai"],
    "limit": 10
  }
  ```

## Environment Variables

```env
# Server
PORT=3001

# Supabase
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Deployment

The backend is automatically deployed to Render.com on push to main branch.

**Production URL**: https://bowerycreative-backend.onrender.com