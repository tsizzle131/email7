# Deployment Guide

## Fixed Issues (Senior Developer Solution)

✅ **Upgraded to Node.js 20.x** - Fixed compatibility with modern dependencies (undici requires Node 20+)
✅ **Updated all dependencies** - Latest stable versions compatible with Node 20
✅ **Fixed TypeScript compilation errors**:
  - Added missing `axios` and `@types/cron` dependencies
  - Fixed PORT type casting issue in index.ts
  - Fixed responseRate property access in gmail-service.ts 
  - Fixed null assignment issues in google-maps.ts
  - Fixed cheerio types from CheerioAPI to Root
  - Added proper type annotations for forEach callbacks
✅ **Simplified build process** - Vercel handles TypeScript compilation automatically
✅ **Excluded src/ directory** - Using only /api structure for Vercel deployment
✅ **Mock API endpoints** - Ensure deployment succeeds before adding heavy dependencies
✅ **Production-ready package.json** - Clean scripts and proper versioning

## Senior Developer Strategy

**Phase 1: Get Basic Deployment Working**
- Deploy with mock APIs first (current state)
- Verify all endpoints work
- Test environment variable setup

**Phase 2: Gradual Feature Integration**
- Add Supabase integration first
- Then add OpenAI services
- Finally add Puppeteer/scraping (may need different platform)

**Phase 3: Optimization**
- Move heavy services to dedicated workers
- Optimize for Vercel's serverless limitations

## Deployment Options

### Option 1: Backend + Frontend Separately (Recommended)

**Backend (API) on Vercel:**
1. Deploy this root directory to Vercel
2. Use the `/api` folder structure for serverless functions
3. Set environment variables in Vercel dashboard

**Frontend on Vercel/Netlify:**
1. Deploy the `/frontend` folder separately
2. Update API_BASE_URL to point to your backend deployment

### Option 2: Monorepo Deployment

Use the current structure with `vercel.json` configuration.

## Environment Variables for Vercel

Add these in your Vercel dashboard:

```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENAI_API_KEY=your_openai_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
GOOGLE_REDIRECT_URI=https://your-domain.vercel.app/auth/google/callback
NODE_ENV=production
```

## Manual Deployment Steps

1. **Push your updated code to GitHub**
2. **Connect repository to Vercel**
3. **Set environment variables**
4. **Deploy**

The deployment should now work without the dependency errors!

## Alternative: Railway/Render Deployment

If Vercel continues to have issues with Puppeteer, consider:
- **Railway**: Better for Node.js apps with heavy dependencies
- **Render**: Good alternative with better Puppeteer support
- **Google Cloud Run**: Containerized deployment option

## Testing Your Deployment

Once deployed, test these endpoints:
- `GET /health` - Health check
- `GET /api/stats/overview` - Basic API functionality
- `POST /api/knowledge-base/search` - RAG functionality