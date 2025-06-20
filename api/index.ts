import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    message: 'Email Agent API',
    status: 'running',
    version: '1.0.0',
    endpoints: [
      'GET /api/health',
      'GET /api/stats/overview',
      'POST /api/scrape/businesses'
    ]
  });
}