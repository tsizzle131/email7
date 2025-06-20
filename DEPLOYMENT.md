# Deployment Guide

## Fixed Issues

✅ **Fixed `rate-limiter-flexible` version** - Changed from `^3.0.8` to `^2.4.2`
✅ **Updated googleapis version** - Changed from `^128.0.0` to `^127.0.0`
✅ **Removed problematic dependencies** - Removed `nodemailer` and `cron` for Vercel compatibility
✅ **Fixed Vercel configuration** - Simplified `vercel.json` and used Vercel's auto-detection
✅ **Added @vercel/node types** - Proper TypeScript support for Vercel functions
✅ **Created individual API endpoints** - Separate files for better Vercel compatibility
✅ **Fixed Node.js version** - Set to `18.x` for Vercel compatibility

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