import { VercelRequest, VercelResponse } from '@vercel/node';
import { supabase } from '../../lib/supabase';
import axios from 'axios';
import * as cheerio from 'cheerio';
import validator from 'validator';
import * as crypto from 'crypto';

// Email extraction handler
async function handleEmailExtraction(req: VercelRequest, res: VercelResponse) {
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
            console.log(`  Failed to scrape ${company.website}:`, scrapeError instanceof Error ? scrapeError.message : String(scrapeError));
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

// Helper functions for email extraction
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.query;

  // Handle email extraction action
  if (action === 'extract-emails') {
    return handleEmailExtraction(req, res);
  }

  // Handle business scraping (default action)
  try {
    const { 
      location, 
      business_type = '', 
      max_results = 20,
      extract_emails = true,
      source = 'google' // google, yelp, yellowpages, linkedin
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

    // Step 1: Check cache for directory search first
    const directoryKey = generateCacheKey(`directory_${location}_${business_type}_${source}`);
    let businesses = await getCachedData(directoryKey, 'business_data');
    
    if (!businesses) {
      // Cache miss - scrape business directory
      businesses = await scrapeBusinessDirectory(location, business_type, source, max_results);
      
      // Cache directory results for 7 days
      await setCachedData(directoryKey, businesses, 'business_data', 7);
    }

    const results = {
      scraped: 0,
      emailsExtracted: 0,
      companies: [] as any[],
      errors: [] as string[],
      fromCache: 0
    };

    // Step 2: Process businesses in batches with duplicate detection
    const processedBusinesses = await deduplicateBusinesses(businesses);
    
    for (const business of processedBusinesses) {
      try {
        if (!business.name) {
          continue;
        }

        // Check for cached business data first
        const cachedBusiness = await checkBusinessDuplicate(business.name, location);
        
        if (cachedBusiness) {
          results.companies.push(cachedBusiness);
          results.scraped++;
          results.fromCache++;
          if (cachedBusiness.email) {
            results.emailsExtracted++;
          }
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

        // Step 4: Save to database with retry logic
        const savedCompany = await saveCompanyWithRetry(company);
        
        if (savedCompany) {
          results.companies.push(savedCompany);
          results.scraped++;
          
          // Cache the successful result
          await cacheBusinessData(business.name, location, savedCompany);
        } else {
          results.errors.push(`Failed to save ${company.name}`);
        }

        // Adaptive delay based on success rate
        const delayMs = results.errors.length > results.scraped * 0.2 ? 1000 : 300;
        await new Promise(resolve => setTimeout(resolve, delayMs));

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
      case 'google':
        searchUrl = `https://www.google.com/maps/search/${encodedBusinessType}+${encodedLocation}`;
        break;
      case 'yelp':
        searchUrl = `https://www.yelp.com/search?find_desc=${encodedBusinessType}&find_loc=${encodedLocation}`;
        break;
      case 'yellowpages':
        searchUrl = `https://www.yellowpages.com/search?search_terms=${encodedBusinessType}&geo_location_terms=${encodedLocation}`;
        break;
      case 'linkedin':
        searchUrl = `https://www.linkedin.com/search/results/companies/?keywords=${encodedBusinessType}&origin=GLOBAL_SEARCH_HEADER&sid=123`;
        break;
      default:
        searchUrl = `https://www.google.com/maps/search/${encodedBusinessType}+${encodedLocation}`;
    }

    // Use ScrapingBee to scrape the directory
    const scrapingParams: any = {
      api_key: process.env.SCRAPINGBEE_API_KEY,
      url: searchUrl,
      render_js: 'true', // Enable JS rendering for dynamic content
      premium_proxy: 'true', // Use premium proxies for better success rate
      country_code: 'us'
    };

    // Add Google-specific parameters when scraping Google
    if (source.toLowerCase() === 'google' && searchUrl.includes('google.com')) {
      scrapingParams.custom_google = 'true'; // Required for Google scraping (costs 20 credits)
    }

    const response = await axios.get('https://app.scrapingbee.com/api/v1/', {
      params: scrapingParams,
      timeout: 30000
    });

    const $ = cheerio.load(response.data);
    
    // Parse businesses based on source
    switch (source.toLowerCase()) {
      case 'google':
        businesses.push(...parseGoogleMapsResults($, maxResults));
        break;
      case 'yelp':
        businesses.push(...parseYelpResults($, maxResults));
        break;
      case 'yellowpages':
        businesses.push(...parseYellowPagesResults($, maxResults));
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

function parseYelpResults($: cheerio.Root, maxResults: number) {
  const businesses: any[] = [];
  
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

function parseYellowPagesResults($: cheerio.Root, maxResults: number) {
  const businesses: any[] = [];
  
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

function parseGoogleMapsResults($: cheerio.Root, maxResults: number) {
  const businesses: any[] = [];
  
  // Google Maps business cards have specific selectors
  const businessSelectors = [
    '[data-result-index]', // Main business card container
    '.hfpxzc', // Business listing container
    '[jsaction*="pane.resultList.business"]', // Business result item
    '.Nv2PK', // Alternative business card
    '[data-cid]' // Business with CID
  ];
  
  for (const selector of businessSelectors) {
    $(selector).each((index, element) => {
      if (businesses.length >= maxResults) return false;
      
      const $business = $(element);
      
      // Extract business name
      const name = $business.find('.qBF1Pd').text().trim() || 
                   $business.find('.fontHeadlineSmall').text().trim() ||
                   $business.find('h3').text().trim() ||
                   $business.find('[data-value="Name"]').next().text().trim();
      
      if (!name) return true; // Skip if no name found
      
      // Extract address
      const address = $business.find('.W4Efsd:last').text().trim() ||
                     $business.find('[data-value="Address"]').next().text().trim() ||
                     $business.find('.rogA2c .fontBodyMedium').text().trim();
      
      // Extract phone number
      const phone = $business.find('[data-value="Phone"]').next().text().trim() ||
                   $business.find('span[aria-label*="phone"]').text().trim() ||
                   $business.find('.rogA2c .fontBodyMedium').filter((i, el) => {
                     return /[\d\(\)\-\+\s]{10,}/.test($(el).text());
                   }).first().text().trim();
      
      // Extract rating
      let rating = null;
      const ratingText = $business.find('.MW4etd').text().trim() ||
                        $business.find('.fontDisplayMedium').text().trim() ||
                        $business.find('[data-value="Rating"]').next().text().trim();
      
      if (ratingText) {
        const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
        if (ratingMatch) {
          rating = parseFloat(ratingMatch[1]);
        }
      }
      
      // Extract website
      let website = null;
      const websiteElement = $business.find('a[data-value="Website"]').attr('href') ||
                            $business.find('a[href*="http"]:not([href*="google.com"])').attr('href') ||
                            $business.find('[data-value="Website"]').next().find('a').attr('href');
      
      if (websiteElement) {
        // Clean up Google redirect URLs
        try {
          const url = new URL(websiteElement);
          if (url.hostname === 'www.google.com' && url.searchParams.has('url')) {
            website = url.searchParams.get('url');
          } else if (!websiteElement.includes('google.com')) {
            website = websiteElement;
          }
        } catch {
          website = websiteElement.includes('google.com') ? null : websiteElement;
        }
      }
      
      // Extract category/business type
      const category = $business.find('.W4Efsd:first').text().trim() ||
                      $business.find('[data-value="Category"]').next().text().trim() ||
                      $business.find('.fontBodyMedium').first().text().trim();
      
      // Only add if we have a valid business name
      if (name && name.length > 2) {
        businesses.push({
          name,
          address: address || null,
          phone: phone || null,
          rating: rating,
          website: website,
          category: category || null,
          email: null
        });
      }
    });
    
    // If we found businesses with this selector, break
    if (businesses.length > 0) break;
  }
  
  // Fallback: try to parse standard Google search results if Maps parsing failed
  if (businesses.length === 0) {
    $('.g').each((index, element) => {
      if (index >= maxResults) return false;
      
      const $result = $(element);
      const name = $result.find('h3').text().trim();
      const link = $result.find('a').attr('href');
      
      if (name && link && !link.includes('google.com') && name.length > 2) {
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
  }
  
  return businesses.slice(0, maxResults);
}

function parseLinkedInResults($: cheerio.Root, maxResults: number) {
  const businesses: any[] = [];
  
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
    // Check cache first
    const cacheKey = generateCacheKey(`email_${website}`);
    const cachedResult = await getCachedData(cacheKey, 'email_extraction');
    if (cachedResult) {
      return cachedResult;
    }

    // Enhanced multi-page email extraction
    const result = await extractEmailsMultiPage(website);
    
    // Cache the result for 30 days
    await setCachedData(cacheKey, result, 'email_extraction', 30);
    
    return result;
  } catch (error) {
    console.warn(`Email extraction failed for ${website}:`, error);
    return { email: null, content: '' };
  }
}

async function extractEmailsMultiPage(website: string): Promise<{ email: string | null; content: string }> {
  const emails: Set<string> = new Set();
  let allContent = '';
  
  // List of pages to check for emails
  const pagesToCheck = [
    '', // Homepage
    '/contact',
    '/contact-us',
    '/get-in-touch',
    '/about',
    '/about-us',
    '/team',
    '/staff',
    '/leadership'
  ];

  // Extract emails from multiple pages
  for (const page of pagesToCheck) {
    try {
      const fullUrl = website.replace(/\/$/, '') + page;
      const pageResult = await extractWithScrapingBee(fullUrl);
      
      if (pageResult.email) {
        emails.add(pageResult.email);
      }
      
      // Extract additional emails from page content
      const pageEmails = extractAllEmailsFromContent(pageResult.content);
      pageEmails.forEach(email => emails.add(email));
      
      allContent += pageResult.content + ' ';
      
      // Small delay between page requests
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (pageError) {
      console.warn(`Failed to extract from ${website}${page}:`, pageError);
      continue;
    }
  }

  // Also try to extract from social media profiles
  try {
    const socialEmails = await extractSocialMediaEmails(website, allContent);
    socialEmails.forEach(email => emails.add(email));
  } catch (socialError) {
    console.warn(`Social media extraction failed for ${website}:`, socialError);
  }

  // Prioritize emails by quality
  const emailArray = Array.from(emails);
  const bestEmail = prioritizeEmails(emailArray);
  
  return {
    email: bestEmail,
    content: allContent.substring(0, 5000) // Limit content size
  };
}

function extractAllEmailsFromContent(content: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = content.match(emailRegex) || [];
  
  return matches
    .filter(email => validator.isEmail(email))
    .filter(email => {
      // Filter out unwanted emails
      const unwanted = ['example@', 'test@', 'noreply@', 'no-reply@', 'donotreply@'];
      return !unwanted.some(pattern => email.toLowerCase().includes(pattern));
    })
    .map(email => email.toLowerCase());
}

function prioritizeEmails(emails: string[]): string | null {
  if (emails.length === 0) return null;
  
  // Priority order for email types
  const priorities = [
    'contact@',
    'info@',
    'hello@',
    'sales@',
    'support@',
    'admin@',
    'office@'
  ];
  
  // Find highest priority email
  for (const priority of priorities) {
    const found = emails.find(email => email.includes(priority));
    if (found) return found;
  }
  
  // Return first email if no priority match
  return emails[0];
}

async function extractSocialMediaEmails(website: string, content: string): Promise<string[]> {
  const emails: string[] = [];
  
  try {
    // Extract social media URLs from content
    const socialUrls = extractSocialMediaUrls(content);
    
    for (const socialUrl of socialUrls.slice(0, 3)) { // Limit to 3 social profiles
      try {
        const socialResult = await extractWithScrapingBee(socialUrl);
        const socialEmails = extractAllEmailsFromContent(socialResult.content);
        emails.push(...socialEmails);
        
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (socialError) {
        console.warn(`Failed to extract from social URL ${socialUrl}:`, socialError);
      }
    }
  } catch (error) {
    console.warn(`Social media email extraction failed:`, error);
  }
  
  return emails;
}

function extractSocialMediaUrls(content: string): string[] {
  const socialUrls: string[] = [];
  
  // LinkedIn URLs
  const linkedinRegex = /https?:\/\/(www\.)?linkedin\.com\/company\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+/g;
  const linkedinMatches = content.match(linkedinRegex) || [];
  socialUrls.push(...linkedinMatches);
  
  // Facebook URLs
  const facebookRegex = /https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+/g;
  const facebookMatches = content.match(facebookRegex) || [];
  socialUrls.push(...facebookMatches);
  
  // Twitter URLs
  const twitterRegex = /https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+/g;
  const twitterMatches = content.match(twitterRegex) || [];
  socialUrls.push(...twitterMatches);
  
  return socialUrls.slice(0, 5); // Limit to 5 URLs
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

function extractEmailsFromHTML($: cheerio.Root): string | null {
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

function getCleanTextContent($: cheerio.Root): string {
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

// Caching utility functions
function generateCacheKey(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

async function getCachedData(cacheKey: string, cacheType: string): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from('business_cache')
      .select('cached_data, expires_at')
      .eq('business_key', cacheKey)
      .eq('cache_type', cacheType)
      .single();

    if (error || !data) {
      return null;
    }

    // Check if cache has expired
    const now = new Date();
    const expiresAt = new Date(data.expires_at);
    
    if (now > expiresAt) {
      // Cache expired, delete it
      await supabase
        .from('business_cache')
        .delete()
        .eq('business_key', cacheKey)
        .eq('cache_type', cacheType);
      
      return null;
    }

    return data.cached_data;
  } catch (error) {
    console.warn('Cache read error:', error);
    return null;
  }
}

async function setCachedData(cacheKey: string, data: any, cacheType: string, daysToExpire: number): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysToExpire);

    await supabase
      .from('business_cache')
      .upsert({
        business_key: cacheKey,
        cached_data: data,
        cache_type: cacheType,
        expires_at: expiresAt.toISOString()
      });
  } catch (error) {
    console.warn('Cache write error:', error);
    // Don't throw - caching is optional
  }
}

async function checkBusinessDuplicate(name: string, location: string): Promise<any | null> {
  const duplicateKey = generateCacheKey(`business_${name}_${location}`.toLowerCase());
  return await getCachedData(duplicateKey, 'business_data');
}

async function cacheBusinessData(name: string, location: string, businessData: any): Promise<void> {
  const duplicateKey = generateCacheKey(`business_${name}_${location}`.toLowerCase());
  await setCachedData(duplicateKey, businessData, 'business_data', 30);
}

async function deduplicateBusinesses(businesses: any[]): Promise<any[]> {
  const seen = new Set<string>();
  const deduplicated = [];
  
  for (const business of businesses) {
    if (!business.name) continue;
    
    // Create a normalized key for duplicate detection
    const normalizedName = business.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const duplicateKey = `${normalizedName}_${business.website || ''}`;
    
    if (!seen.has(duplicateKey)) {
      seen.add(duplicateKey);
      deduplicated.push(business);
    }
  }
  
  return deduplicated;
}

async function saveCompanyWithRetry(company: any, maxRetries: number = 3): Promise<any | null> {
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
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
        return savedCompany;
      }
      
      lastError = error;
      
      // Exponential backoff: wait longer between retries
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
    } catch (saveError) {
      lastError = saveError;
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`Failed to save ${company.name} after ${maxRetries} attempts:`, lastError);
  return null;
}