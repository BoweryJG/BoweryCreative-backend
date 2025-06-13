# Bowery Creative Backend

Backend services for Bowery Creative Agency website.

## Stack

- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Edge Functions**: Supabase Edge Functions (Deno)
- **Storage**: Supabase Storage

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