import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleMapsService } from '../../src/services/google-maps';
import { WebsiteScraperService } from '../../src/services/website-scraper';
import { DataEnrichmentService } from '../../src/services/data-enrichment';
import { RAGDatabaseService } from '../../src/services/rag-database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const googleMapsService = new GoogleMapsService();
    const websiteScraperService = new WebsiteScraperService();
    const dataEnrichmentService = new DataEnrichmentService();
    const ragService = new RAGDatabaseService();
    
    const [scrapingStats, emailStats, enrichmentStats, ragStats] = await Promise.all([
      googleMapsService.getScrapingStats(),
      websiteScraperService.getEmailExtractionStats(),
      dataEnrichmentService.getEnrichmentStats(),
      ragService.getKnowledgeBaseStats()
    ]);

    res.status(200).json({
      success: true,
      stats: {
        scraping: scrapingStats,
        emails: emailStats,
        enrichment: enrichmentStats,
        knowledgeBase: ragStats
      }
    });
  } catch (error) {
    console.error('Error in stats/overview:', error);
    res.status(500).json({ error: 'Failed to get overview stats' });
  }
}