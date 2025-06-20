import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import { google } from 'googleapis';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    console.error('Error in campaigns/start:', error);
    res.status(500).json({ 
      error: 'Failed to start campaign',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function personalizeEmail(content: string, company: any): Promise<string> {
  let personalizedContent = content;

  // Basic variable replacement
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

function calculateNextFollowUp(): string {
  // Schedule next follow-up for 3-4 days from now
  const days = Math.random() > 0.5 ? 3 : 4;
  const nextFollowUp = new Date();
  nextFollowUp.setDate(nextFollowUp.getDate() + days);
  return nextFollowUp.toISOString();
}