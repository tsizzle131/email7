import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get real stats from Supabase
    const [companiesResult, threadsResult, knowledgeResult] = await Promise.allSettled([
      supabase.from('companies').select('scraped_at, enriched_at, email').limit(1000),
      supabase.from('email_threads').select('sent_at, response_received').limit(1000),
      supabase.from('knowledge_base').select('document_type, created_at').limit(100)
    ]);

    const companies = companiesResult.status === 'fulfilled' ? companiesResult.value.data || [] : [];
    const threads = threadsResult.status === 'fulfilled' ? threadsResult.value.data || [] : [];
    const knowledge = knowledgeResult.status === 'fulfilled' ? knowledgeResult.value.data || [] : [];

    // Calculate scraping stats
    const today = new Date().toISOString().split('T')[0];
    const thisWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const scrapingStats = {
      total: companies.length,
      today: companies.filter(c => c.scraped_at?.startsWith(today)).length,
      thisWeek: companies.filter(c => c.scraped_at && c.scraped_at >= thisWeek).length,
      lastScraped: companies.length > 0 ? Math.max(...companies.map(c => new Date(c.scraped_at || 0).getTime())) : null
    };

    // Calculate email stats
    const withEmails = companies.filter(c => c.email).length;
    const emailStats = {
      totalCompanies: companies.length,
      companiesWithEmails: withEmails,
      extractionRate: companies.length > 0 ? ((withEmails / companies.length) * 100).toFixed(1) : '0',
      pendingExtraction: companies.length - withEmails
    };

    // Calculate enrichment stats
    const enriched = companies.filter(c => c.enriched_at).length;
    const enrichmentStats = {
      eligible: companies.length,
      enriched,
      pending: companies.length - enriched,
      enrichmentRate: companies.length > 0 ? ((enriched / companies.length) * 100).toFixed(1) : '0',
      costTracker: {
        totalTokensUsed: 0,
        totalCost: 0,
        requestCount: enriched
      }
    };

    // Calculate knowledge base stats
    const knowledgeStats = {
      total: knowledge.length,
      byType: knowledge.reduce((acc: any, doc) => {
        acc[doc.document_type] = (acc[doc.document_type] || 0) + 1;
        return acc;
      }, {}),
      recentlyAdded: knowledge.filter(doc => 
        new Date(doc.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length
    };

    res.status(200).json({
      success: true,
      stats: {
        scraping: scrapingStats,
        emails: emailStats,
        enrichment: enrichmentStats,
        knowledgeBase: knowledgeStats
      }
    });
  } catch (error) {
    console.error('Error in stats/overview:', error);
    
    // Return mock data if database connection fails
    const mockStats = {
      scraping: { total: 0, today: 0, thisWeek: 0, lastScraped: null },
      emails: { totalCompanies: 0, companiesWithEmails: 0, extractionRate: '0', pendingExtraction: 0 },
      enrichment: { eligible: 0, enriched: 0, pending: 0, enrichmentRate: '0', costTracker: { totalTokensUsed: 0, totalCost: 0, requestCount: 0 } },
      knowledgeBase: { total: 0, byType: {}, recentlyAdded: 0 }
    };

    res.status(200).json({
      success: true,
      stats: mockStats,
      note: 'Using mock data - check database connection and environment variables'
    });
  }
}