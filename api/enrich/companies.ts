import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { batch_size = 10 } = req.body;
    
    // Mock enrichment response
    const mockStats = {
      eligible: 0,
      enriched: 0,
      pending: 0,
      enrichmentRate: '0',
      costTracker: {
        totalTokensUsed: 0,
        totalCost: 0,
        requestCount: 0
      },
      estimatedCostPerCompany: '0'
    };

    res.status(200).json({
      success: true,
      stats: mockStats,
      note: `Mock enrichment for ${batch_size} companies. Full enrichment will be available after OpenAI API integration.`
    });
  } catch (error) {
    console.error('Error in enrich/companies:', error);
    res.status(500).json({ error: 'Failed to enrich companies' });
  }
}