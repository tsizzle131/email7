import { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleMapsService } from '../../src/services/google-maps';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { location, business_type, radius, max_results, exclude_chains } = req.body;
    
    const config = {
      location,
      business_type,
      radius,
      max_results,
      exclude_chains
    };

    const googleMapsService = new GoogleMapsService();
    const companies = await googleMapsService.searchBusinesses(config);
    
    res.status(200).json({
      success: true,
      count: companies.length,
      companies: companies.slice(0, 10)
    });
  } catch (error) {
    console.error('Error in scrape/businesses:', error);
    res.status(500).json({ error: 'Failed to scrape businesses' });
  }
}