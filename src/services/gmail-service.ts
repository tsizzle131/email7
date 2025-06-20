import { google } from 'googleapis';
import { supabase } from '@/config/database';
import { EmailAccount, EmailThread, EmailCampaign } from '@/types';
import { RAGDatabaseService } from './rag-database';
import winston from 'winston';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/gmail.log' }),
    new winston.transports.Console()
  ]
});

// Rate limiter for Gmail API
const gmailRateLimiter = new RateLimiterMemory({
  points: 100, // Number of requests
  duration: 60, // Per minute
});

export class GmailService {
  private ragService: RAGDatabaseService;

  constructor() {
    this.ragService = new RAGDatabaseService();
  }

  async authenticateAccount(authCode: string): Promise<EmailAccount> {
    try {
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      // Get tokens from authorization code
      const { tokens } = await oauth2Client.getToken(authCode);
      oauth2Client.setCredentials(tokens);

      // Get user info to get email address
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      
      const emailAddress = profile.data.emailAddress!;
      const accountName = emailAddress.split('@')[0];

      // Save to database
      const { data, error } = await supabase
        .from('email_accounts')
        .upsert({
          email: emailAddress,
          oauth_tokens: tokens,
          account_name: accountName,
          status: 'active'
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      logger.info(`Gmail account authenticated: ${emailAddress}`);
      
      return {
        id: data.id,
        email: data.email,
        oauth_tokens: data.oauth_tokens,
        account_name: data.account_name,
        status: data.status as 'active' | 'inactive' | 'error',
        created_at: new Date(data.created_at),
        updated_at: new Date(data.updated_at)
      };
    } catch (error) {
      logger.error('Error authenticating Gmail account:', error);
      throw error;
    }
  }

  async sendEmail(
    accountId: string,
    to: string,
    subject: string,
    content: string,
    companyData?: any
  ): Promise<string> {
    try {
      await gmailRateLimiter.consume('gmail-send');

      const account = await this.getEmailAccount(accountId);
      const gmail = await this.getAuthenticatedGmail(account);

      // Personalize email content using company data and RAG
      const personalizedContent = await this.personalizeEmailContent(content, companyData);

      // Create email message
      const message = this.createEmailMessage(account.email, to, subject, personalizedContent);

      // Send email
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: message
        }
      });

      logger.info(`Email sent to ${to} from ${account.email}`);
      return response.data.id!;
    } catch (error) {
      logger.error(`Error sending email to ${to}:`, error);
      throw error;
    }
  }

  async createEmailCampaign(campaignData: {
    name: string;
    accountId: string;
    companyIds: string[];
    template: {
      subject: string;
      content: string;
    };
  }): Promise<EmailCampaign> {
    try {
      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('email_campaigns')
        .insert({
          name: campaignData.name,
          account_id: campaignData.accountId,
          company_count: campaignData.companyIds.length,
          status: 'draft'
        })
        .select()
        .single();

      if (campaignError) {
        throw campaignError;
      }

      // Create email threads for each company
      const threads = campaignData.companyIds.map(companyId => ({
        campaign_id: campaign.id,
        company_id: companyId,
        email_content: campaignData.template.content,
        subject: campaignData.template.subject,
        conversation_status: 'pending',
        follow_up_count: 0
      }));

      const { error: threadsError } = await supabase
        .from('email_threads')
        .insert(threads);

      if (threadsError) {
        throw threadsError;
      }

      logger.info(`Created email campaign: ${campaignData.name} with ${campaignData.companyIds.length} recipients`);

      return {
        id: campaign.id,
        name: campaign.name,
        company_count: campaign.company_count,
        status: campaign.status as any,
        account_id: campaign.account_id,
        created_at: new Date(campaign.created_at),
        updated_at: new Date(campaign.updated_at)
      };
    } catch (error) {
      logger.error('Error creating email campaign:', error);
      throw error;
    }
  }

  async startCampaign(campaignId: string): Promise<void> {
    try {
      // Update campaign status
      await supabase
        .from('email_campaigns')
        .update({ status: 'active' })
        .eq('id', campaignId);

      // Get all pending threads for this campaign
      const { data: threads, error } = await supabase
        .from('email_threads')
        .select(`
          *,
          companies (*),
          email_campaigns (
            email_accounts (*)
          )
        `)
        .eq('campaign_id', campaignId)
        .eq('conversation_status', 'pending');

      if (error) {
        throw error;
      }

      if (!threads || threads.length === 0) {
        logger.info(`No pending emails found for campaign ${campaignId}`);
        return;
      }

      logger.info(`Starting campaign ${campaignId} with ${threads.length} emails`);

      // Send emails with rate limiting
      for (const thread of threads) {
        try {
          const company = thread.companies;
          const account = thread.email_campaigns.email_accounts;

          if (!company.email) {
            logger.warn(`No email found for company ${company.name}`);
            continue;
          }

          const messageId = await this.sendEmail(
            account.id,
            company.email,
            thread.subject,
            thread.email_content,
            company
          );

          // Update thread
          await supabase
            .from('email_threads')
            .update({
              sent_at: new Date().toISOString(),
              next_follow_up: this.calculateNextFollowUp(),
              updated_at: new Date().toISOString()
            })
            .eq('id', thread.id);

          // Small delay between emails
          await this.delay(2000);
        } catch (error) {
          logger.error(`Error sending email in campaign ${campaignId}:`, error);
        }
      }

      logger.info(`Campaign ${campaignId} started successfully`);
    } catch (error) {
      logger.error(`Error starting campaign ${campaignId}:`, error);
      throw error;
    }
  }

  async checkForReplies(accountId: string): Promise<void> {
    try {
      const account = await this.getEmailAccount(accountId);
      const gmail = await this.getAuthenticatedGmail(account);

      // Get unread emails
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 50
      });

      if (!response.data.messages) {
        return;
      }

      for (const message of response.data.messages) {
        try {
          const emailData = await gmail.users.messages.get({
            userId: 'me',
            id: message.id!
          });

          await this.processIncomingEmail(emailData.data, accountId);
        } catch (error) {
          logger.error(`Error processing message ${message.id}:`, error);
        }
      }
    } catch (error) {
      logger.error(`Error checking replies for account ${accountId}:`, error);
      throw error;
    }
  }

  async processFollowUps(): Promise<void> {
    try {
      const { data: threads, error } = await supabase
        .from('email_threads')
        .select(`
          *,
          companies (*),
          email_campaigns (
            email_accounts (*)
          )
        `)
        .eq('response_received', false)
        .eq('conversation_status', 'pending')
        .not('next_follow_up', 'is', null)
        .lte('next_follow_up', new Date().toISOString())
        .lt('follow_up_count', 12); // Max 12 follow-ups (2 per week for 6 weeks)

      if (error) {
        throw error;
      }

      if (!threads || threads.length === 0) {
        logger.info('No follow-ups due');
        return;
      }

      logger.info(`Processing ${threads.length} follow-ups`);

      for (const thread of threads) {
        try {
          const company = thread.companies;
          const account = thread.email_campaigns.email_accounts;

          // Generate follow-up content
          const followUpContent = await this.generateFollowUpContent(thread, company);
          const followUpSubject = `Re: ${thread.subject}`;

          await this.sendEmail(
            account.id,
            company.email,
            followUpSubject,
            followUpContent,
            company
          );

          // Update thread
          const nextFollowUp = thread.follow_up_count < 11 ? this.calculateNextFollowUp() : null;
          
          await supabase
            .from('email_threads')
            .update({
              follow_up_count: thread.follow_up_count + 1,
              next_follow_up: nextFollowUp,
              updated_at: new Date().toISOString()
            })
            .eq('id', thread.id);

          logger.info(`Sent follow-up ${thread.follow_up_count + 1} to ${company.name}`);
          
          // Delay between follow-ups
          await this.delay(3000);
        } catch (error) {
          logger.error(`Error processing follow-up for thread ${thread.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error processing follow-ups:', error);
      throw error;
    }
  }

  private async getEmailAccount(accountId: string): Promise<EmailAccount> {
    const { data, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (error || !data) {
      throw new Error('Email account not found');
    }

    return {
      id: data.id,
      email: data.email,
      oauth_tokens: data.oauth_tokens,
      account_name: data.account_name,
      status: data.status as any,
      created_at: new Date(data.created_at),
      updated_at: new Date(data.updated_at)
    };
  }

  private async getAuthenticatedGmail(account: EmailAccount) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials(account.oauth_tokens);

    // Check if token needs refresh
    if (account.oauth_tokens.expiry_date && account.oauth_tokens.expiry_date < Date.now()) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        // Update stored tokens
        await supabase
          .from('email_accounts')
          .update({ oauth_tokens: credentials })
          .eq('id', account.id);
      } catch (error) {
        logger.error(`Error refreshing token for ${account.email}:`, error);
        throw error;
      }
    }

    return google.gmail({ version: 'v1', auth: oauth2Client });
  }

  private createEmailMessage(from: string, to: string, subject: string, content: string): string {
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

  private async personalizeEmailContent(content: string, companyData?: any): Promise<string> {
    if (!companyData) {
      return content;
    }

    let personalizedContent = content;

    // Replace common variables
    const replacements = {
      '{{company_name}}': companyData.name || 'there',
      '{{company_industry}}': companyData.enriched_data?.industry || 'your industry',
      '{{company_size}}': companyData.enriched_data?.company_size || '',
      '{{company_services}}': companyData.enriched_data?.services?.join(', ') || 'your services'
    };

    Object.entries(replacements).forEach(([placeholder, value]) => {
      personalizedContent = personalizedContent.replace(new RegExp(placeholder, 'g'), value);
    });

    return personalizedContent;
  }

  private async generateFollowUpContent(thread: any, company: any): Promise<string> {
    const followUpNumber = thread.follow_up_count + 1;
    
    // Use RAG to get relevant context for follow-up
    const context = await this.ragService.getContextForQuery(
      `follow up email ${followUpNumber} for ${company.enriched_data?.industry || 'business'} company`,
      500
    );

    const templates = [
      `Hi there,\n\nI wanted to follow up on my previous email about helping ${company.name} with your lead generation needs.\n\nMany ${company.enriched_data?.industry || 'businesses'} like yours are finding great success with our automated outreach solutions.\n\nWould you be interested in a quick 15-minute call to discuss how we can help you grow your customer base?\n\nBest regards`,
      `Hello,\n\nI hope this message finds you well. I'm reaching out again because I believe our solution could really benefit ${company.name}.\n\nWe've helped similar companies increase their lead generation by 300% with our AI-powered email campaigns.\n\nWould you like to see some case studies relevant to your industry?\n\nLooking forward to hearing from you.`,
      `Hi,\n\nJust wanted to check if you had a chance to review my previous email about our lead generation services.\n\nI understand you're busy, but I think there's a real opportunity here for ${company.name} to significantly increase your customer acquisition.\n\nWould next week work for a brief call?\n\nBest regards`
    ];

    const templateIndex = Math.min(followUpNumber - 1, templates.length - 1);
    return templates[templateIndex];
  }

  private calculateNextFollowUp(): string {
    // Schedule next follow-up for 3-4 days from now (2 per week)
    const days = Math.random() > 0.5 ? 3 : 4;
    const nextFollowUp = new Date();
    nextFollowUp.setDate(nextFollowUp.getDate() + days);
    return nextFollowUp.toISOString();
  }

  private async processIncomingEmail(emailData: any, accountId: string): Promise<void> {
    try {
      // Extract sender email
      const fromHeader = emailData.payload.headers.find((h: any) => h.name === 'From');
      const senderEmail = this.extractEmailFromHeader(fromHeader?.value || '');

      if (!senderEmail) {
        return;
      }

      // Find matching company and thread
      const { data: company } = await supabase
        .from('companies')
        .select('id, name')
        .eq('email', senderEmail)
        .single();

      if (!company) {
        logger.info(`Received email from unknown sender: ${senderEmail}`);
        return;
      }

      // Find active thread for this company
      const { data: thread } = await supabase
        .from('email_threads')
        .select('*')
        .eq('company_id', company.id)
        .eq('response_received', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!thread) {
        logger.info(`No active thread found for response from ${company.name}`);
        return;
      }

      // Update thread to mark response received
      await supabase
        .from('email_threads')
        .update({
          response_received: true,
          conversation_status: 'responded',
          next_follow_up: null // Stop follow-ups
        })
        .eq('id', thread.id);

      // Save the conversation
      const emailContent = this.extractEmailContent(emailData.payload);
      await supabase
        .from('conversations')
        .insert({
          thread_id: thread.id,
          message_content: emailContent,
          sender: 'prospect',
          sentiment: 'neutral' // Could be analyzed with AI
        });

      logger.info(`Received response from ${company.name}, stopped follow-ups`);

      // Update analytics
      await this.updateAnalytics('email_responses', 1);
    } catch (error) {
      logger.error('Error processing incoming email:', error);
    }
  }

  private extractEmailFromHeader(header: string): string | null {
    const emailMatch = header.match(/<([^>]+)>/);
    if (emailMatch) {
      return emailMatch[1];
    }
    
    // Try to extract email without brackets
    const simpleMatch = header.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return simpleMatch ? simpleMatch[1] : null;
  }

  private extractEmailContent(payload: any): string {
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString();
    }
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString();
        }
      }
    }
    
    return '';
  }

  private async updateAnalytics(metric: string, value: number): Promise<void> {
    const { error } = await supabase
      .from('analytics')
      .insert({
        metric_name: metric,
        value,
        date: new Date().toISOString().split('T')[0]
      });

    if (error) {
      logger.error(`Error updating analytics for ${metric}:`, error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getCampaignStats(campaignId?: string): Promise<any> {
    let query = supabase
      .from('email_threads')
      .select('*, email_campaigns(name)');

    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const stats = {
      totalEmails: data?.length || 0,
      sent: data?.filter(t => t.sent_at).length || 0,
      responses: data?.filter(t => t.response_received).length || 0,
      pending: data?.filter(t => !t.sent_at).length || 0,
      followUps: data?.reduce((sum, t) => sum + t.follow_up_count, 0) || 0
    };

    stats['responseRate'] = stats.sent > 0 ? ((stats.responses / stats.sent) * 100).toFixed(1) : '0';

    return stats;
  }
}