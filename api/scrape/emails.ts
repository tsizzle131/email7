import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';
import validator from 'validator';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      company_ids = [], 
      batch_size = 10,
      use_scrapingbee = true,
      skip_existing = true 
    } = req.body;

    if (!process.env.SCRAPINGBEE_API_KEY && use_scrapingbee) {
      return res.status(400).json({ 
        error: 'ScrapingBee API key not configured',
        note: 'Add SCRAPINGBEE_API_KEY to environment variables or set use_scrapingbee to false'
      });
    }

    // Get companies that need email extraction
    let query = supabase
      .from('companies')
      .select('id, name, website, email, scraped_content')
      .not('website', 'is', null);

    if (skip_existing) {
      query = query.is('email', null);
    }

    if (company_ids.length > 0) {
      query = query.in('id', company_ids);
    }

    const { data: companies, error: fetchError } = await query.limit(batch_size);

    if (fetchError) {
      throw new Error(`Database error: ${fetchError.message}`);
    }

    if (!companies || companies.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No companies found for email extraction',
        results: {
          processed: 0,
          emailsFound: 0,
          emailsUpdated: 0,
          errors: []
        }
      });
    }

    const results = {
      processed: 0,
      emailsFound: 0,
      emailsUpdated: 0,
      errors: [] as any[]
    };

    // Process each company
    for (const company of companies) {
      results.processed++;
      
      try {
        console.log(`Processing: ${company.name} (${company.website})`);
        
        let extractedEmail = null;

        // Method 1: Extract from existing scraped content if available
        if (company.scraped_content) {
          extractedEmail = extractEmailFromContent(company.scraped_content);
          console.log(`  Found email in scraped content: ${extractedEmail}`);
        }

        // Method 2: If no email found, scrape the website
        if (!extractedEmail && company.website) {
          try {
            if (use_scrapingbee) {
              extractedEmail = await extractEmailWithScrapingBee(company.website);
            } else {
              extractedEmail = await extractEmailDirectly(company.website);
            }
            console.log(`  Found email via website scraping: ${extractedEmail}`);
          } catch (scrapeError) {
            console.log(`  Failed to scrape ${company.website}:`, scrapeError.message);
          }
        }

        // Update company if email found
        if (extractedEmail && validator.isEmail(extractedEmail)) {
          const { error: updateError } = await supabase
            .from('companies')
            .update({ 
              email: extractedEmail,
              email_extracted_at: new Date().toISOString()
            })
            .eq('id', company.id);

          if (updateError) {
            results.errors.push({
              company: company.name,
              error: `Failed to update: ${updateError.message}`
            });
          } else {
            results.emailsFound++;
            results.emailsUpdated++;
            console.log(`  ✅ Updated ${company.name} with email: ${extractedEmail}`);
          }
        } else if (extractedEmail) {
          results.errors.push({
            company: company.name,
            error: `Invalid email format: ${extractedEmail}`
          });
        } else {
          console.log(`  ❌ No email found for ${company.name}`);
        }

        // Small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        results.errors.push({
          company: company.name,
          error: error.message
        });
        console.error(`Error processing ${company.name}:`, error);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Email extraction completed. Found ${results.emailsFound} emails from ${results.processed} companies.`,
      results,
      summary: {
        total_processed: results.processed,
        emails_found: results.emailsFound,
        success_rate: results.processed > 0 ? ((results.emailsFound / results.processed) * 100).toFixed(1) + '%' : '0%',
        error_count: results.errors.length
      }
    });

  } catch (error: any) {
    console.error('Email extraction error:', error);
    return res.status(500).json({
      success: false,
      error: 'Email extraction failed',
      message: error.message
    });
  }
}

/**
 * Extract email from text content using regex
 */
function extractEmailFromContent(content: string): string | null {
  // Enhanced email regex that avoids common false positives
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = content.match(emailRegex) || [];
  
  // Filter out common false positives and get the best email
  const validEmails = emails.filter(email => {
    const lowerEmail = email.toLowerCase();
    
    // Skip obviously fake/placeholder emails
    if (lowerEmail.includes('example') || 
        lowerEmail.includes('test') || 
        lowerEmail.includes('placeholder') ||
        lowerEmail.includes('noreply') ||
        lowerEmail.includes('no-reply') ||
        lowerEmail.includes('donotreply')) {
      return false;
    }
    
    // Validate email format
    return validator.isEmail(email);
  });

  // Prefer contact@, info@, hello@ emails over others
  const preferredEmails = validEmails.filter(email => {
    const local = email.split('@')[0].toLowerCase();
    return ['contact', 'info', 'hello', 'hi', 'support'].includes(local);
  });

  return preferredEmails[0] || validEmails[0] || null;
}

/**
 * Extract email using ScrapingBee API
 */
async function extractEmailWithScrapingBee(website: string): Promise<string | null> {
  const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
    params: {
      api_key: process.env.SCRAPINGBEE_API_KEY,
      url: website,
      render_js: 'false',
      premium_proxy: 'false'
    },
    timeout: 15000
  });

  const $ = cheerio.load(response.data);
  
  // First, check for mailto links
  const mailtoLinks = $('a[href^="mailto:"]');
  if (mailtoLinks.length > 0) {
    const href = mailtoLinks.first().attr('href');
    if (href) {
      const email = href.replace('mailto:', '').split('?')[0];
      if (validator.isEmail(email)) {
        return email;
      }
    }
  }

  // Then check contact pages and footer areas
  const contactAreas = $('footer, .footer, .contact, #contact, [class*="contact"]');
  contactAreas.each((_, element) => {
    const text = $(element).text();
    const email = extractEmailFromContent(text);
    if (email) {
      return email;
    }
  });

  // Finally, check the entire page content
  const fullContent = $('body').text();
  return extractEmailFromContent(fullContent);
}

/**
 * Extract email using direct HTTP request
 */
async function extractEmailDirectly(website: string): Promise<string | null> {
  const response = await axios.get(website, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    timeout: 10000,
    maxRedirects: 3
  });

  const $ = cheerio.load(response.data);
  
  // Check for mailto links first
  const mailtoLinks = $('a[href^="mailto:"]');
  if (mailtoLinks.length > 0) {
    const href = mailtoLinks.first().attr('href');
    if (href) {
      const email = href.replace('mailto:', '').split('?')[0];
      if (validator.isEmail(email)) {
        return email;
      }
    }
  }

  // Check page content
  const content = $('body').text();
  return extractEmailFromContent(content);
}