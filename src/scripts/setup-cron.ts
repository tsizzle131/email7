#!/usr/bin/env tsx

import { CronJob } from 'cron';
import dotenv from 'dotenv';
import { GmailService } from '../services/gmail-service';
import { WebsiteScraperService } from '../services/website-scraper';
import { DataEnrichmentService } from '../services/data-enrichment';
import { supabase } from '../config/database';
import winston from 'winston';

dotenv.config();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/cron.log' }),
    new winston.transports.Console()
  ]
});

class CronScheduler {
  private gmailService: GmailService;
  private websiteScraperService: WebsiteScraperService;
  private enrichmentService: DataEnrichmentService;

  constructor() {
    this.gmailService = new GmailService();
    this.websiteScraperService = new WebsiteScraperService();
    this.enrichmentService = new DataEnrichmentService();
  }

  async initialize() {
    await this.websiteScraperService.initialize();
    logger.info('Cron scheduler initialized');
  }

  setupJobs() {
    // Check for email replies every 15 minutes
    new CronJob('*/15 * * * *', async () => {
      try {
        logger.info('Checking for email replies...');
        
        const { data: accounts } = await supabase
          .from('email_accounts')
          .select('id')
          .eq('status', 'active');

        if (accounts) {
          for (const account of accounts) {
            await this.gmailService.checkForReplies(account.id);
          }
        }
        
        logger.info('Email reply check completed');
      } catch (error) {
        logger.error('Error checking email replies:', error);
      }
    }, null, true);

    // Process follow-ups twice daily (9 AM and 2 PM)
    new CronJob('0 9,14 * * *', async () => {
      try {
        logger.info('Processing follow-ups...');
        await this.gmailService.processFollowUps();
        logger.info('Follow-ups processed');
      } catch (error) {
        logger.error('Error processing follow-ups:', error);
      }
    }, null, true);

    // Extract emails from newly scraped websites every 2 hours
    new CronJob('0 */2 * * *', async () => {
      try {
        logger.info('Extracting emails from websites...');
        await this.websiteScraperService.scrapeCompanyEmails();
        logger.info('Email extraction completed');
      } catch (error) {
        logger.error('Error extracting emails:', error);
      }
    }, null, true);

    // Enrich company data daily at 3 AM (off-peak hours for lower costs)
    new CronJob('0 3 * * *', async () => {
      try {
        logger.info('Starting daily data enrichment...');
        await this.enrichmentService.enrichCompanyData(20); // Process 20 companies per day
        
        const stats = await this.enrichmentService.getEnrichmentStats();
        logger.info('Daily enrichment completed', { stats });
      } catch (error) {
        logger.error('Error during daily enrichment:', error);
      }
    }, null, true);

    // Generate daily analytics at midnight
    new CronJob('0 0 * * *', async () => {
      try {
        logger.info('Generating daily analytics...');
        await this.generateDailyAnalytics();
        logger.info('Daily analytics generated');
      } catch (error) {
        logger.error('Error generating daily analytics:', error);
      }
    }, null, true);

    // Cleanup old logs weekly (Sunday at 2 AM)
    new CronJob('0 2 * * 0', async () => {
      try {
        logger.info('Cleaning up old analytics data...');
        
        // Keep only last 90 days of analytics
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 90);
        
        await supabase
          .from('analytics')
          .delete()
          .lt('date', cutoffDate.toISOString().split('T')[0]);
        
        logger.info('Analytics cleanup completed');
      } catch (error) {
        logger.error('Error during analytics cleanup:', error);
      }
    }, null, true);

    logger.info('All cron jobs scheduled successfully');
  }

  private async generateDailyAnalytics() {
    const today = new Date().toISOString().split('T')[0];

    // Get companies data
    const { data: companies } = await supabase
      .from('companies')
      .select('scraped_at, enriched_at, email');

    if (companies) {
      const scrapedToday = companies.filter(c => 
        c.scraped_at && c.scraped_at.startsWith(today)
      ).length;

      const enrichedToday = companies.filter(c => 
        c.enriched_at && c.enriched_at.startsWith(today)
      ).length;

      const withEmails = companies.filter(c => c.email).length;

      // Save analytics
      const analytics = [
        { metric_name: 'daily_companies_scraped', value: scrapedToday, date: today },
        { metric_name: 'daily_companies_enriched', value: enrichedToday, date: today },
        { metric_name: 'total_companies_with_emails', value: withEmails, date: today }
      ];

      await supabase.from('analytics').insert(analytics);
    }

    // Get email thread data
    const { data: threads } = await supabase
      .from('email_threads')
      .select('sent_at, response_received');

    if (threads) {
      const sentToday = threads.filter(t => 
        t.sent_at && t.sent_at.startsWith(today)
      ).length;

      const responsesToday = threads.filter(t => 
        t.response_received && t.sent_at && t.sent_at.startsWith(today)
      ).length;

      const analytics = [
        { metric_name: 'daily_emails_sent', value: sentToday, date: today },
        { metric_name: 'daily_email_responses', value: responsesToday, date: today }
      ];

      await supabase.from('analytics').insert(analytics);
    }
  }

  async shutdown() {
    logger.info('Shutting down cron scheduler...');
    await this.websiteScraperService.close();
  }
}

async function main() {
  const scheduler = new CronScheduler();
  
  try {
    await scheduler.initialize();
    scheduler.setupJobs();
    
    logger.info('Cron scheduler is running. Press Ctrl+C to stop.');
    
    // Keep the process running
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await scheduler.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await scheduler.shutdown();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start cron scheduler:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}