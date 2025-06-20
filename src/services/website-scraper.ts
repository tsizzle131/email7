import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import validator from 'validator';
import { supabase } from '@/config/database';
import { Company } from '@/types';
import winston from 'winston';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/website-scraper.log' }),
    new winston.transports.Console()
  ]
});

const rateLimiter = new RateLimiterMemory({
  points: 10, // Number of requests
  duration: 60, // Per minute to be respectful to websites
});

export class WebsiteScraperService {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async scrapeCompanyEmails(): Promise<void> {
    if (!this.browser) {
      await this.initialize();
    }

    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .not('website', 'is', null)
      .is('email', null)
      .limit(50);

    if (error) {
      throw error;
    }

    if (!companies || companies.length === 0) {
      logger.info('No companies found for email extraction');
      return;
    }

    logger.info(`Processing ${companies.length} companies for email extraction`);

    for (const company of companies) {
      try {
        await rateLimiter.consume('website-scraper');
        const result = await this.extractCompanyData(company);
        
        if (result.email || result.content) {
          await this.updateCompanyData(company.id, result);
          logger.info(`Updated ${company.name} with email: ${result.email || 'none found'}`);
        }
      } catch (error) {
        logger.error(`Error processing ${company.name}:`, error);
      }
    }
  }

  private async extractCompanyData(company: any): Promise<{
    email: string | null;
    content: string;
    additionalData: any;
  }> {
    const page = await this.browser!.newPage();
    
    try {
      // Set user agent to appear as a real browser
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Set viewport
      await page.setViewport({ width: 1366, height: 768 });
      
      // Navigate to website with timeout
      await page.goto(company.website, { 
        waitUntil: 'networkidle0', 
        timeout: 30000 
      });

      // Get page content
      const content = await page.content();
      const $ = cheerio.load(content);

      // Extract emails
      const email = this.extractEmails($, company.website);
      
      // Extract additional content for enrichment
      const additionalData = this.extractAdditionalData($);
      
      // Get clean text content
      const textContent = this.getCleanTextContent($);

      return {
        email,
        content: textContent,
        additionalData
      };
    } catch (error) {
      logger.warn(`Failed to scrape ${company.website}:`, error);
      return { email: null, content: '', additionalData: {} };
    } finally {
      await page.close();
    }
  }

  private extractEmails($: cheerio.Root, website: string): string | null {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = new Set<string>();

    // Check common selectors for contact information
    const contactSelectors = [
      'a[href^="mailto:"]',
      '.contact-info',
      '.contact',
      '.footer',
      '.header-contact',
      '#contact',
      '.email',
      '.contact-email'
    ];

    // Extract emails from href attributes
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const email = href.replace('mailto:', '').split('?')[0];
        if (validator.isEmail(email)) {
          emails.add(email.toLowerCase());
        }
      }
    });

    // Extract emails from text content
    contactSelectors.forEach(selector => {
      $(selector).each((_, el) => {
        const text = $(el).text();
        const foundEmails = text.match(emailRegex);
        if (foundEmails) {
          foundEmails.forEach(email => {
            if (validator.isEmail(email)) {
              emails.add(email.toLowerCase());
            }
          });
        }
      });
    });

    // Also check the entire page text for emails
    const pageText = $('body').text();
    const pageEmails = pageText.match(emailRegex);
    if (pageEmails) {
      pageEmails.forEach((email: string) => {
        if (validator.isEmail(email)) {
          emails.add(email.toLowerCase());
        }
      });
    }

    // Filter out common spam/unwanted emails
    const filteredEmails = Array.from(emails).filter(email => {
      const unwanted = [
        'example@',
        'test@',
        'admin@',
        'no-reply@',
        'noreply@',
        'do-not-reply@',
        'support@wordpress',
        'privacy@',
        'legal@'
      ];
      return !unwanted.some(pattern => email.includes(pattern));
    });

    // Prefer business emails over generic ones
    const businessEmails = filteredEmails.filter(email => {
      const businessPatterns = ['info@', 'contact@', 'hello@', 'sales@', 'inquiry@'];
      return businessPatterns.some(pattern => email.includes(pattern));
    });

    if (businessEmails.length > 0) {
      return businessEmails[0];
    }

    // If no business emails, try to generate one based on domain
    if (filteredEmails.length === 0 && website) {
      try {
        const domain = new URL(website).hostname;
        const commonPrefixes = ['info', 'contact', 'hello', 'sales'];
        
        // Return the most likely email format
        return `info@${domain}`;
      } catch (error) {
        logger.warn(`Could not parse domain from ${website}`);
      }
    }

    return filteredEmails.length > 0 ? filteredEmails[0] : null;
  }

  private extractAdditionalData($: cheerio.Root): any {
    const data: any = {};

    // Extract company size indicators
    const sizeIndicators = ['employees', 'team members', 'staff', 'people'];
    const text = $('body').text().toLowerCase();
    sizeIndicators.forEach(indicator => {
      const regex = new RegExp(`(\\d+)\\+?\\s*${indicator}`, 'i');
      const match = text.match(regex);
      if (match) {
        data.employeeCount = match[1];
      }
    });

    // Extract services/products
    const services: string[] = [];
    $('nav a, .services a, .products a, .menu a').each((_, el) => {
      const service = $(el).text().trim();
      if (service && service.length > 2 && service.length < 50) {
        services.push(service);
      }
    });
    if (services.length > 0) {
      data.services = [...new Set(services)].slice(0, 10);
    }

    // Extract social media links
    data.socialMedia = {};
    $('a[href*="linkedin"]').first().each((_, el) => {
      const href = $(el).attr('href');
      if (href) data.socialMedia.linkedin = href;
    });
    $('a[href*="twitter"]').first().each((_, el) => {
      const href = $(el).attr('href');
      if (href) data.socialMedia.twitter = href;
    });
    $('a[href*="facebook"]').first().each((_, el) => {
      const href = $(el).attr('href');
      if (href) data.socialMedia.facebook = href;
    });

    // Extract contact information
    const phoneRegex = /[\+]?[1-9]?[\s\-\(\)]?[\d\s\-\(\)]{10,}/g;
    const phones = text.match(phoneRegex);
    if (phones && phones.length > 0) {
      data.additionalPhones = phones.slice(0, 2);
    }

    return data;
  }

  private getCleanTextContent($: cheerio.Root): string {
    // Remove script and style elements
    $('script, style, noscript').remove();
    
    // Get text from important sections
    const importantSections = [
      '.about, #about',
      '.services, #services', 
      '.products, #products',
      '.company, #company',
      'main',
      '.content',
      '.description'
    ].join(', ');

    let content = $(importantSections).text();
    
    // If no specific sections found, get general content
    if (!content || content.length < 100) {
      content = $('body').text();
    }

    // Clean and limit content
    return content
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 5000); // Limit to 5000 chars for storage efficiency
  }

  private async updateCompanyData(companyId: string, data: {
    email: string | null;
    content: string;
    additionalData: any;
  }): Promise<void> {
    const updates: any = {
      updated_at: new Date().toISOString()
    };

    if (data.email) {
      updates.email = data.email;
    }

    if (data.content) {
      updates.scraped_content = JSON.stringify({
        content: data.content,
        extractedData: data.additionalData,
        scrapedAt: new Date().toISOString()
      });
    }

    const { error } = await supabase
      .from('companies')
      .update(updates)
      .eq('id', companyId);

    if (error) {
      throw error;
    }

    // Update analytics
    if (data.email) {
      await this.updateAnalytics('emails_extracted', 1);
    }
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

  async getEmailExtractionStats(): Promise<any> {
    const { data, error } = await supabase
      .from('companies')
      .select('email, website, updated_at')
      .not('website', 'is', null);

    if (error) {
      throw error;
    }

    const withEmails = data.filter(c => c.email).length;
    const withWebsites = data.length;

    return {
      totalCompanies: withWebsites,
      companiesWithEmails: withEmails,
      extractionRate: withWebsites > 0 ? ((withEmails / withWebsites) * 100).toFixed(1) : '0',
      pendingExtraction: withWebsites - withEmails
    };
  }
}