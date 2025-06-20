import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { location, business_type, radius, max_results, exclude_chains } = req.body;
    
    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

    // For now, return a mock response for testing deployment
    // The full GoogleMapsService will be implemented after successful deployment
    const mockCompanies = [
      {
        id: '1',
        name: `Sample Business in ${location}`,
        website: 'https://example.com',
        email: 'contact@example.com',
        phone: '+1-555-0123',
        address: `123 Main St, ${location}`,
        category: business_type || 'business',
        rating: 4.5
      }
    ];
    
    res.status(200).json({
      success: true,
      count: mockCompanies.length,
      companies: mockCompanies,
      note: 'This is a mock response for deployment testing. Full implementation will be activated after successful deployment.'
    });
  } catch (error) {
    console.error('Error in scrape/businesses:', error);
    res.status(500).json({ error: 'Failed to scrape businesses' });
  }
}