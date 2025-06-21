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
      location, 
      business_type = '', 
      max_results = 20,
      extract_emails = true,
      source = 'yelp' // yelp, yellowpages, google, linkedin
    } = req.body;

    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

    if (!process.env.SCRAPINGBEE_API_KEY) {
      return res.status(400).json({ 
        error: 'ScrapingBee API key not configured',
        note: 'Add SCRAPINGBEE_API_KEY to environment variables'
      });
    }

    // Step 1: Search for businesses using ScrapingBee to scrape business directories
    const businesses = await scrapeBusinessDirectory(location, business_type, source, max_results);

    const results = {
      scraped: 0,
      emailsExtracted: 0,
      companies: [] as any[],
      errors: [] as string[]
    };

    // Step 2: Process each business from directory
    for (const business of businesses) {
      try {
        if (!business.name) {
          continue;
        }

        const company = {
          name: business.name,
          website: business.website || null,
          phone: business.phone || null,
          address: business.address || null,
          category: business.category || business_type || null,
          rating: business.rating || null,
          email: business.email || null,
          scraped_content: null as string | null
        };

        // Step 3: Extract email from website if not already found and website exists
        if (extract_emails && company.website && !company.email) {
          try {
            const emailData = await extractEmailFromWebsite(company.website);
            company.email = emailData.email;
            company.scraped_content = emailData.content;
          } catch (emailError) {
            console.warn(`Failed to extract email for ${company.name}:`, emailError);
          }
        }

        if (company.email) {
          results.emailsExtracted++;
        }

        // Step 4: Save to database
        const { data: savedCompany, error } = await supabase
          .from('companies')
          .upsert({
            name: company.name,
            website: company.website,
            email: company.email,
            phone: company.phone,
            address: company.address,
            category: company.category,
            rating: company.rating,
            scraped_content: company.scraped_content,
            scraped_at: new Date().toISOString()
          })
          .select()
          .single();

        if (!error) {
          results.companies.push(savedCompany);
          results.scraped++;
        } else {
          results.errors.push(`Failed to save ${company.name}: ${error.message}`);
        }

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (businessError) {
        results.errors.push(`Error processing ${business.name}: ${businessError}`);
      }
    }

    res.status(200).json({
      success: true,
      location,
      business_type,
      source,
      results
    });

  } catch (error) {
    console.error('Error in scrape/businesses:', error);
    res.status(500).json({ 
      error: 'Failed to scrape businesses',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

async function scrapeBusinessDirectory(location: string, businessType: string, source: string, maxResults: number) {
  const businesses = [];
  
  try {
    let searchUrl = '';
    const encodedLocation = encodeURIComponent(location);
    const encodedBusinessType = encodeURIComponent(businessType);

    // Build search URL based on source
    switch (source.toLowerCase()) {
      case 'yelp':
        searchUrl = `https://www.yelp.com/search?find_desc=${encodedBusinessType}&find_loc=${encodedLocation}`;
        break;
      case 'yellowpages':
        searchUrl = `https://www.yellowpages.com/search?search_terms=${encodedBusinessType}&geo_location_terms=${encodedLocation}`;
        break;
      case 'google':
        searchUrl = `https://www.google.com/search?q=${encodedBusinessType}+${encodedLocation}+business+directory`;
        break;
      case 'linkedin':
        searchUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodedBusinessType}&origin=GLOBAL_SEARCH_HEADER&sid=123`;
        break;
      default:
        searchUrl = `https://www.yelp.com/search?find_desc=${encodedBusinessType}&find_loc=${encodedLocation}`;
    }

    // Use ScrapingBee to scrape the directory
    const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
      params: {
        api_key: process.env.SCRAPINGBEE_API_KEY,
        url: searchUrl,
        render_js: 'true', // Enable JS rendering for dynamic content
        premium_proxy: 'true', // Use premium proxies for better success rate
        country_code: 'us'
      },
      timeout: 30000
    });

    const $ = cheerio.load(response.data);
    
    // Parse businesses based on source
    switch (source.toLowerCase()) {
      case 'yelp':
        businesses.push(...parseYelpResults($, maxResults));
        break;
      case 'yellowpages':
        businesses.push(...parseYellowPagesResults($, maxResults));
        break;
      case 'google':
        businesses.push(...parseGoogleResults($, maxResults));
        break;
      case 'linkedin':
        businesses.push(...parseLinkedInResults($, maxResults));
        break;
    }

  } catch (error) {
    console.error(`Error scraping ${source}:`, error);
    // Return empty array if scraping fails
  }

  return businesses.slice(0, maxResults);
}

function parseYelpResults($: cheerio.CheerioAPI, maxResults: number) {
  const businesses = [];
  
  $('[data-testid="serp-ia-card"]').each((index, element) => {
    if (index >= maxResults) return false;
    
    const $business = $(element);
    const name = $business.find('h3 a').text().trim();
    const address = $business.find('[data-testid="address"]').text().trim();
    const phone = $business.find('[data-testid="phone-number"]').text().trim();
    const rating = parseFloat($business.find('[data-testid="rating"]').text().trim()) || null;
    const websiteLink = $business.find('a[href*="biz_redir"]').attr('href');
    
    if (name) {
      businesses.push({
        name,
        address: address || null,
        phone: phone || null,
        rating,
        website: websiteLink ? extractWebsiteFromYelpRedirect(websiteLink) : null,
        category: null,
        email: null
      });
    }
  });
  
  return businesses;
}

function parseYellowPagesResults($: cheerio.CheerioAPI, maxResults: number) {
  const businesses = [];
  
  $('.result').each((index, element) => {
    if (index >= maxResults) return false;
    
    const $business = $(element);
    const name = $business.find('.business-name').text().trim();
    const address = $business.find('.adr').text().trim();
    const phone = $business.find('.phones').text().trim();
    const website = $business.find('.track-visit-website').attr('href');
    
    if (name) {
      businesses.push({
        name,
        address: address || null,
        phone: phone || null,
        rating: null,
        website: website || null,
        category: null,
        email: null
      });
    }
  });
  
  return businesses;
}

function parseGoogleResults($: cheerio.CheerioAPI, maxResults: number) {
  const businesses = [];
  
  $('.g').each((index, element) => {
    if (index >= maxResults) return false;
    
    const $result = $(element);
    const name = $result.find('h3').text().trim();
    const link = $result.find('a').attr('href');
    
    if (name && link && !link.includes('google.com')) {
      businesses.push({
        name,
        address: null,
        phone: null,
        rating: null,
        website: link,
        category: null,
        email: null
      });
    }
  });
  
  return businesses;
}

function parseLinkedInResults($: cheerio.CheerioAPI, maxResults: number) {
  const businesses = [];
  
  $('.entity-result').each((index, element) => {
    if (index >= maxResults) return false;
    
    const $company = $(element);
    const name = $company.find('.entity-result__title-text a').text().trim();
    const link = $company.find('.entity-result__title-text a').attr('href');
    
    if (name) {
      businesses.push({
        name,
        address: null,
        phone: null,
        rating: null,
        website: link || null,
        category: null,
        email: null
      });
    }
  });
  
  return businesses;
}

function extractWebsiteFromYelpRedirect(redirectUrl: string): string | null {
  try {
    const url = new URL(redirectUrl);
    return url.searchParams.get('url') || null;
  } catch {
    return null;
  }
}

async function extractEmailFromWebsite(website: string): Promise<{ email: string | null; content: string }> {
  try {
    // Always use ScrapingBee for email extraction since we're ScrapingBee-only now
    return await extractWithScrapingBee(website);
  } catch (error) {
    console.warn(`Email extraction failed for ${website}:`, error);
    // Fallback to direct scraping if ScrapingBee fails
    try {
      return await extractWithDirectScraping(website);
    } catch (fallbackError) {
      console.warn(`Direct scraping also failed for ${website}:`, fallbackError);
      return { email: null, content: '' };
    }
  }
}

async function extractWithScrapingBee(website: string): Promise<{ email: string | null; content: string }> {
  const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
    params: {
      api_key: process.env.SCRAPINGBEE_API_KEY,
      url: website,
      render_js: 'false',
      premium_proxy: 'false'
    },
    timeout: 10000
  });

  const $ = cheerio.load(response.data);
  const email = extractEmailsFromHTML($);
  const content = getCleanTextContent($);

  return { email, content };
}

async function extractWithDirectScraping(website: string): Promise<{ email: string | null; content: string }> {
  const response = await axios.get(website, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    timeout: 10000,
    maxRedirects: 3
  });

  const $ = cheerio.load(response.data);
  const email = extractEmailsFromHTML($);
  const content = getCleanTextContent($);

  return { email, content };
}

function extractEmailsFromHTML($: cheerio.CheerioAPI): string | null {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = new Set<string>();

  // Check mailto links
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      const email = href.replace('mailto:', '').split('?')[0];
      if (validator.isEmail(email)) {
        emails.add(email.toLowerCase());
      }
    }
  });

  // Check text content in common contact areas
  const contactSelectors = [
    '.contact-info', '.contact', '.footer', '.header-contact', 
    '#contact', '.email', '.contact-email', 'footer'
  ];

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

  // Filter out unwanted emails
  const filteredEmails = Array.from(emails).filter(email => {
    const unwanted = ['example@', 'test@', 'noreply@', 'no-reply@'];
    return !unwanted.some(pattern => email.includes(pattern));
  });

  // Prefer business emails
  const businessEmails = filteredEmails.filter(email => {
    const businessPatterns = ['info@', 'contact@', 'hello@', 'sales@'];
    return businessPatterns.some(pattern => email.includes(pattern));
  });

  return businessEmails.length > 0 ? businessEmails[0] : 
         (filteredEmails.length > 0 ? filteredEmails[0] : null);
}

function getCleanTextContent($: cheerio.CheerioAPI): string {
  // Remove unwanted elements
  $('script, style, noscript').remove();
  
  // Get text from important sections
  const importantSections = [
    '.about', '#about', '.services', '#services', 
    '.company', '#company', 'main', '.content'
  ].join(', ');

  let content = $(importantSections).text();
  
  if (!content || content.length < 100) {
    content = $('body').text();
  }

  return content
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 3000);
}