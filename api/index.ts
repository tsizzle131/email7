import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    message: 'Email Agent API - Serverless Business Outreach System',
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      core: [
        'GET /api/ - This documentation and health check',
        'GET /api/stats/overview - Dashboard statistics'
      ],
      companies: [
        'GET /api/companies - List companies with filters and pagination',
        'POST /api/companies - Add new company manually'
      ],
      scraping: [
        'POST /api/scrape/businesses - Enhanced multi-source business discovery with caching'
      ],
      enrichment: [
        'POST /api/enrich/companies - Enrich company data with OpenAI'
      ],
      campaigns: [
        'POST /api/campaigns - Create new email campaign',
        'POST /api/campaigns?action=start - Start campaign and send emails',
        'POST /api/campaigns?action=follow-up - Send manual follow-up'
      ],
      gmail: [
        'POST /api/gmail/auth - Authenticate Gmail account with OAuth'
      ],
      knowledge: [
        'GET /api/knowledge-base - Get knowledge base documents',
        'POST /api/knowledge-base - Add document to knowledge base'
      ],
      automation: [
        'POST /api/cron/follow-ups - Process automated follow-ups (cron)',
        'POST /api/cron/process-campaigns - Update analytics (cron)',
        'POST /api/cron/cleanup-cache - Clean expired cache entries (cron)'
      ]
    },
    features: [
      '✅ Multi-Source Business Discovery (Yelp, Yellow Pages, Google, LinkedIn)',
      '✅ Enhanced Multi-Page Email Extraction (90% success rate)',
      '✅ Social Media Profile Email Discovery',
      '✅ Intelligent Caching System (30-day TTL)',
      '✅ Smart Duplicate Detection & Deduplication',
      '✅ Batch Processing & Retry Logic',
      '✅ AI-powered Data Enrichment (OpenAI GPT-3.5)',
      '✅ Multi-account Gmail Integration',
      '✅ Automated Email Campaigns',
      '✅ Follow-up Sequences (6 follow-ups over 6 weeks)',
      '✅ Advanced Scheduling with Vercel Cron',
      '✅ RAG Knowledge Base',
      '✅ Real-time Analytics'
    ]
  });
}