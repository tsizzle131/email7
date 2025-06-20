import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import { google } from 'googleapis';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { action } = req.query;

  if (req.method === 'POST') {
    if (action === 'start') {
      return handleStart(req, res);
    } else if (action === 'follow-up') {
      return handleFollowUp(req, res);
    } else {
      return handleCreate(req, res);
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

// Create Campaign Handler
async function handleCreate(req: VercelRequest, res: VercelResponse) {
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

      finalCompanyIds = companies?.map((c: any) => c.id) || [];
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
    const threads = finalCompanyIds.map((companyId: string) => ({
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
    console.error('Error in campaigns create:', error);
    res.status(500).json({ 
      error: 'Failed to create campaign',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Start Campaign Handler
async function handleStart(req: VercelRequest, res: VercelResponse) {
  try {
    const { campaign_id } = req.body;

    if (!campaign_id) {
      return res.status(400).json({ error: 'Campaign ID is required' });
    }

    // Get campaign details with account and pending threads
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .select(`
        *,
        email_accounts (*)
      `)
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'draft') {
      return res.status(400).json({ error: 'Campaign is not in draft status' });
    }

    // Get pending email threads
    const { data: threads, error: threadsError } = await supabase
      .from('email_threads')
      .select(`
        *,
        companies (*)
      `)
      .eq('campaign_id', campaign_id)
      .eq('conversation_status', 'pending')
      .is('sent_at', null);

    if (threadsError) {
      throw threadsError;
    }

    if (!threads || threads.length === 0) {
      return res.status(400).json({ error: 'No pending emails found for campaign' });
    }

    // Setup Gmail client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials(campaign.email_accounts.oauth_tokens);

    // Check if token needs refresh
    if (campaign.email_accounts.oauth_tokens.expiry_date && 
        campaign.email_accounts.oauth_tokens.expiry_date < Date.now()) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        // Update stored tokens
        await supabase
          .from('email_accounts')
          .update({ oauth_tokens: credentials })
          .eq('id', campaign.account_id);
      } catch (error) {
        return res.status(400).json({ 
          error: 'Failed to refresh Gmail token. Please re-authenticate.',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    let sent = 0;
    let errors = 0;
    const results = [];

    // Send emails
    for (const thread of threads) {
      try {
        const company = thread.companies;
        
        if (!company.email) {
          errors++;
          results.push({ 
            company: company.name, 
            status: 'error', 
            error: 'No email address' 
          });
          continue;
        }

        // Personalize email content
        const personalizedContent = await personalizeEmail(
          thread.email_content, 
          company
        );

        // Create email message
        const rawMessage = createEmailMessage(
          campaign.email_accounts.email,
          company.email,
          thread.subject,
          personalizedContent
        );

        // Send email
        const response = await gmail.users.messages.send({
          userId: 'me',
          requestBody: {
            raw: rawMessage
          }
        });

        // Update thread
        await supabase
          .from('email_threads')
          .update({
            sent_at: new Date().toISOString(),
            next_follow_up: calculateNextFollowUp(),
            updated_at: new Date().toISOString()
          })
          .eq('id', thread.id);

        sent++;
        results.push({ 
          company: company.name, 
          status: 'sent', 
          message_id: response.data.id 
        });

        // Delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (emailError) {
        errors++;
        results.push({ 
          company: thread.companies.name, 
          status: 'error', 
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        });
      }
    }

    // Update campaign status
    await supabase
      .from('email_campaigns')
      .update({ 
        status: sent > 0 ? 'active' : 'draft',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaign_id);

    res.status(200).json({
      success: true,
      campaign_id,
      results: {
        sent,
        errors,
        total: threads.length,
        details: results
      }
    });

  } catch (error) {
    console.error('Error in campaigns start:', error);
    res.status(500).json({ 
      error: 'Failed to start campaign',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Follow-up Handler
async function handleFollowUp(req: VercelRequest, res: VercelResponse) {
  try {
    const { thread_id, custom_message } = req.body;

    if (!thread_id) {
      return res.status(400).json({ error: 'Thread ID is required' });
    }

    // Get thread details
    const { data: thread, error: threadError } = await supabase
      .from('email_threads')
      .select(`
        *,
        companies (*),
        email_campaigns (
          *,
          email_accounts (*)
        )
      `)
      .eq('id', thread_id)
      .single();

    if (threadError || !thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (thread.conversation_status !== 'pending') {
      return res.status(400).json({ 
        error: 'Can only send follow-ups to pending threads' 
      });
    }

    if (thread.follow_up_count >= 6) {
      return res.status(400).json({ 
        error: 'Maximum follow-ups (6) already sent' 
      });
    }

    const campaign = thread.email_campaigns;
    const company = thread.companies;
    const account = campaign.email_accounts;

    // Setup Gmail client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials(account.oauth_tokens);

    // Check if token needs refresh
    if (account.oauth_tokens.expiry_date && 
        account.oauth_tokens.expiry_date < Date.now()) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        // Update stored tokens
        await supabase
          .from('email_accounts')
          .update({ oauth_tokens: credentials })
          .eq('id', account.id);
      } catch (error) {
        return res.status(400).json({ 
          error: 'Failed to refresh Gmail token. Please re-authenticate.',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Generate follow-up content
    const followUpContent = custom_message || 
      generateFollowUpContent(thread.follow_up_count + 1, company);
    
    const subject = generateFollowUpSubject(thread.follow_up_count + 1, thread.subject);

    // Personalize content
    const personalizedContent = await personalizeEmail(followUpContent, company);

    // Create email message
    const rawMessage = createEmailMessage(
      account.email,
      company.email,
      subject,
      personalizedContent
    );

    // Send follow-up email
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
        threadId: thread.gmail_thread_id // Keep in same thread
      }
    });

    // Update thread
    const { data: updatedThread, error: updateError } = await supabase
      .from('email_threads')
      .update({
        follow_up_count: thread.follow_up_count + 1,
        next_follow_up: calculateNextFollowUp(thread.follow_up_count + 1),
        updated_at: new Date().toISOString()
      })
      .eq('id', thread_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({
      success: true,
      thread: updatedThread,
      follow_up: {
        message_id: response.data.id,
        subject: subject,
        follow_up_count: thread.follow_up_count + 1,
        next_follow_up: calculateNextFollowUp(thread.follow_up_count + 1)
      }
    });

  } catch (error) {
    console.error('Error in campaigns follow-up:', error);
    res.status(500).json({ 
      error: 'Failed to send follow-up',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Helper functions
async function personalizeEmail(content: string, company: any): Promise<string> {
  let personalizedContent = content;

  const replacements = {
    '{{company_name}}': company.name || 'there',
    '{{company_industry}}': company.enriched_data?.industry || 'your industry',
    '{{company_size}}': company.enriched_data?.company_size || '',
    '{{company_services}}': company.enriched_data?.services?.join(', ') || 'your services',
    '{{website}}': company.website || '',
    '{{location}}': company.address || ''
  };

  Object.entries(replacements).forEach(([placeholder, value]) => {
    personalizedContent = personalizedContent.replace(
      new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 
      value
    );
  });

  return personalizedContent;
}

function generateFollowUpContent(followUpNumber: number, company: any): string {
  const templates = {
    1: `Hi {{company_name}},\n\nI wanted to follow up on my previous email about improving your business outreach.\n\nMany companies in {{company_industry}} are seeing great results with automated email campaigns that feel personal and authentic.\n\nWould you be interested in a quick 15-minute call to discuss how this could work for your business?\n\nBest regards`,
    2: `Hi {{company_name}},\n\nI understand you're probably busy, but I wanted to reach out one more time about the email automation opportunity.\n\nWhat caught my attention about your business is {{company_services}}, and I think there's a real opportunity to help you scale your outreach.\n\nWould next week work for a brief conversation?\n\nBest regards`,
    3: `Hi {{company_name}},\n\nLast follow-up from me on this. I've helped several businesses in {{location}} significantly increase their lead generation through targeted email campaigns.\n\nIf you'd like to explore this further, I'm happy to share some case studies relevant to your industry.\n\nOtherwise, I'll assume this isn't a priority right now.\n\nBest regards`
  };

  return templates[followUpNumber as keyof typeof templates] || templates[3];
}

function generateFollowUpSubject(followUpNumber: number, originalSubject: string): string {
  const prefixes = {
    1: 'Re: ',
    2: 'Following up: ',
    3: 'Final follow-up: '
  };

  const prefix = prefixes[followUpNumber as keyof typeof prefixes] || 'Re: ';
  return prefix + originalSubject.replace(/^(Re:|Following up:|Final follow-up:)\s*/i, '');
}

function createEmailMessage(from: string, to: string, subject: string, content: string): string {
  const email = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    content
  ].join('\n');

  return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

function calculateNextFollowUp(followUpCount?: number): string | null {
  if (!followUpCount || followUpCount >= 6) {
    return null;
  }

  const days = followUpCount <= 2 ? (Math.random() > 0.5 ? 3 : 4) : 7;
  const nextFollowUp = new Date();
  nextFollowUp.setDate(nextFollowUp.getDate() + days);
  return nextFollowUp.toISOString();
}