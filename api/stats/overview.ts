import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Mock stats for deployment testing
    const mockStats = {
      scraping: {
        total: 0,
        today: 0,
        thisWeek: 0,
        lastScraped: null
      },
      emails: {
        totalCompanies: 0,
        companiesWithEmails: 0,
        extractionRate: '0',
        pendingExtraction: 0
      },
      enrichment: {
        eligible: 0,
        enriched: 0,
        pending: 0,
        enrichmentRate: '0',
        costTracker: {
          totalTokensUsed: 0,
          totalCost: 0,
          requestCount: 0
        }
      },
      knowledgeBase: {
        total: 0,
        byType: {},
        recentlyAdded: 0
      }
    };

    res.status(200).json({
      success: true,
      stats: mockStats,
      note: 'Mock data for deployment testing. Real stats will be available after connecting to Supabase.'
    });
  } catch (error) {
    console.error('Error in stats/overview:', error);
    res.status(500).json({ error: 'Failed to get overview stats' });
  }
}