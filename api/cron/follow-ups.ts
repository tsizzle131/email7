import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import { google } from 'googleapis';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify this is a cron request
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date().toISOString();
    const results = {
      processed: 0,
      sent: 0,
      errors: 0,
      details: [] as any[]
    };

    // Find threads ready for follow-up
    const { data: threads, error: threadsError } = await supabase
      .from('email_threads')
      .select(`
        *,
        companies (*),
        email_campaigns (
          *,
          email_accounts (*)
        )
      `)
      .lte('next_follow_up', now)
      .eq('conversation_status', 'pending')
      .not('sent_at', 'is', null)
      .lt('follow_up_count', 6) // Max 6 follow-ups over 6 weeks
      .limit(50); // Process in batches

    if (threadsError) {
      throw threadsError;
    }

    if (!threads || threads.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No follow-ups due',
        results
      });
    }

    // Process each follow-up
    for (const thread of threads) {
      try {
        results.processed++;
        
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
          } catch (tokenError) {
            results.errors++;
            results.details.push({
              thread_id: thread.id,
              company: company.name,
              status: 'error',
              error: 'Token refresh failed'
            });
            continue;
          }
        }

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Generate follow-up content based on count
        const followUpContent = generateFollowUpContent(thread.follow_up_count + 1, company);
        const subject = generateFollowUpSubject(thread.follow_up_count + 1, thread.subject);

        // Create email message
        const rawMessage = createEmailMessage(
          account.email,
          company.email,
          subject,
          followUpContent
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
        await supabase
          .from('email_threads')
          .update({
            follow_up_count: thread.follow_up_count + 1,
            next_follow_up: calculateNextFollowUp(thread.follow_up_count + 1),
            updated_at: new Date().toISOString()
          })
          .eq('id', thread.id);

        results.sent++;
        results.details.push({
          thread_id: thread.id,
          company: company.name,
          status: 'sent',
          follow_up_count: thread.follow_up_count + 1,
          message_id: response.data.id
        });

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (emailError) {
        results.errors++;
        results.details.push({
          thread_id: thread.id,
          company: thread.companies.name,
          status: 'error',
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        });
      }
    }

    res.status(200).json({
      success: true,
      timestamp: now,
      results
    });

  } catch (error) {
    console.error('Error in cron/follow-ups:', error);
    res.status(500).json({ 
      error: 'Failed to process follow-ups',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function generateFollowUpContent(followUpNumber: number, company: any): string {
  const templates = {
    1: `Hi {{company_name}},

I wanted to follow up on my previous email about improving your business outreach. 

Many companies in {{company_industry}} are seeing great results with automated email campaigns that feel personal and authentic.

Would you be interested in a quick 15-minute call to discuss how this could work for your business?

Best regards`,

    2: `Hi {{company_name}},

I understand you're probably busy, but I wanted to reach out one more time about the email automation opportunity.

What caught my attention about your business is {{company_services}}, and I think there's a real opportunity to help you scale your outreach.

Would next week work for a brief conversation?

Best regards`,

    3: `Hi {{company_name}},

Last follow-up from me on this. I've helped several businesses in {{location}} significantly increase their lead generation through targeted email campaigns.

If you'd like to explore this further, I'm happy to share some case studies relevant to your industry.

Otherwise, I'll assume this isn't a priority right now.

Best regards`,

    4: `Hi {{company_name}},

Hope all is well! Circling back after a few weeks in case your priorities have shifted.

Our email automation system is helping businesses like yours generate 3-5x more qualified leads per month.

Happy to send over a quick case study if you're interested.

Best regards`,

    5: `Hi {{company_name}},

Quick question - are you currently satisfied with your lead generation results?

If not, I'd love to show you how we've helped similar businesses in {{company_industry}} automate their outreach and increase conversions.

5-minute call to explore?

Best regards`,

    6: `Hi {{company_name}},

This will be my final follow-up. I know timing isn't always right, but wanted to leave the door open.

If you ever want to explore how automated email campaigns could help grow {{company_name}}, feel free to reach out.

Wishing you continued success!

Best regards`
  };

  let content = templates[followUpNumber as keyof typeof templates] || templates[6];

  // Personalize content
  const replacements = {
    '{{company_name}}': company.name || 'there',
    '{{company_industry}}': company.enriched_data?.industry || 'your industry',
    '{{company_services}}': company.enriched_data?.services?.join(', ') || 'your services',
    '{{location}}': company.address || 'your area'
  };

  Object.entries(replacements).forEach(([placeholder, value]) => {
    content = content.replace(
      new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 
      value
    );
  });

  return content;
}

function generateFollowUpSubject(followUpNumber: number, originalSubject: string): string {
  const prefixes = {
    1: 'Re: ',
    2: 'Following up: ',
    3: 'Final follow-up: ',
    4: 'Checking in: ',
    5: 'Quick question: ',
    6: 'Last note: '
  };

  const prefix = prefixes[followUpNumber as keyof typeof prefixes] || 'Re: ';
  return prefix + originalSubject.replace(/^(Re:|Following up:|Final follow-up:|Checking in:|Quick question:|Last note:)\s*/i, '');
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

function calculateNextFollowUp(followUpCount: number): string | null {
  if (followUpCount >= 6) {
    return null; // No more follow-ups
  }

  // Schedule pattern: 3-4 days for first few, then weekly
  const days = followUpCount <= 2 ? (Math.random() > 0.5 ? 3 : 4) : 7;
  const nextFollowUp = new Date();
  nextFollowUp.setDate(nextFollowUp.getDate() + days);
  return nextFollowUp.toISOString();
}