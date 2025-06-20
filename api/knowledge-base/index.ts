import { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // Get all documents
    const mockDocuments = [
      {
        id: '1',
        title: 'Company Overview',
        content: 'Sample company information...',
        document_type: 'company_info',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    res.status(200).json({
      success: true,
      documents: mockDocuments,
      note: 'Mock knowledge base documents for testing.'
    });
  } else if (req.method === 'POST') {
    // Add document
    const { title, content, document_type } = req.body;
    
    if (!title || !content || !document_type) {
      return res.status(400).json({ error: 'Missing required fields: title, content, document_type' });
    }

    res.status(200).json({
      success: true,
      id: `mock-${Date.now()}`,
      note: 'Document would be added to knowledge base after RAG integration.'
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}