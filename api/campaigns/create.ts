import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      name, 
      account_id, 
      company_ids = [], 
      template,
      filters = {}
    } = req.body;

    if (!name || !account_id) {
      return res.status(400).json({ 
        error: 'Campaign name and account_id are required' 
      });
    }

    if (!template || !template.subject || !template.content) {
      return res.status(400).json({ 
        error: 'Email template with subject and content is required' 
      });
    }

    // Verify email account exists
    const { data: account, error: accountError } = await supabase
      .from('email_accounts')
      .select('id, email, status')
      .eq('id', account_id)
      .eq('status', 'active')
      .single();

    if (accountError || !account) {
      return res.status(404).json({ error: 'Active email account not found' });
    }

    let finalCompanyIds = company_ids;

    // If no specific companies provided, use filters to find companies
    if (company_ids.length === 0) {
      let query = supabase
        .from('companies')
        .select('id')
        .not('email', 'is', null);

      // Apply filters
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.enriched_only) {
        query = query.not('enriched_data', 'is', null);
      }
      if (filters.location) {
        query = query.ilike('address', `%${filters.location}%`);
      }
      if (filters.max_companies) {
        query = query.limit(filters.max_companies);
      }

      const { data: companies, error: companiesError } = await query;
      
      if (companiesError) {
        throw companiesError;
      }

      finalCompanyIds = companies?.map(c => c.id) || [];
    }

    if (finalCompanyIds.length === 0) {
      return res.status(400).json({ error: 'No companies found for campaign' });
    }

    // Create campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .insert({
        name,
        account_id,
        company_count: finalCompanyIds.length,
        status: 'draft'
      })
      .select()
      .single();

    if (campaignError) {
      throw campaignError;
    }

    // Create email threads for each company
    const threads = finalCompanyIds.map(companyId => ({
      campaign_id: campaign.id,
      company_id: companyId,
      email_content: template.content,
      subject: template.subject,
      conversation_status: 'pending',
      follow_up_count: 0
    }));

    const { error: threadsError } = await supabase
      .from('email_threads')
      .insert(threads);

    if (threadsError) {
      throw threadsError;
    }

    res.status(201).json({
      success: true,
      campaign: {
        ...campaign,
        account_email: account.email
      },
      company_count: finalCompanyIds.length
    });

  } catch (error) {
    console.error('Error in campaigns/create:', error);
    res.status(500).json({ 
      error: 'Failed to create campaign',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}