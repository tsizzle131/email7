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
      radius = 50000, 
      max_results = 20,
      extract_emails = true 
    } = req.body;

    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

    if (!process.env.GOOGLE_MAPS_API_KEY) {
      return res.status(400).json({ 
        error: 'Google Maps API key not configured',
        note: 'Add GOOGLE_MAPS_API_KEY to environment variables'
      });
    }

    // Step 1: Search for businesses using Google Places API
    const query = business_type ? `${business_type} in ${location}` : location;
    const placesResponse = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', {
      params: {
        query,
        key: process.env.GOOGLE_MAPS_API_KEY,
        radius,
        type: 'establishment'
      }
    });

    if (placesResponse.data.status !== 'OK') {
      throw new Error(`Google Places API error: ${placesResponse.data.status}`);
    }

    let places = placesResponse.data.results || [];
    places = places.slice(0, max_results);

    const results = {
      scraped: 0,
      emailsExtracted: 0,
      companies: [] as any[],
      errors: [] as string[]
    };

    // Step 2: Process each business
    for (const place of places) {
      try {
        if (!place.name || place.business_status !== 'OPERATIONAL') {
          continue;
        }

        // Get detailed place information
        const placeDetails = await getPlaceDetails(place.place_id, process.env.GOOGLE_MAPS_API_KEY!);
        
        const company = {
          name: place.name,
          website: placeDetails.website || null,
          phone: placeDetails.formatted_phone_number || null,
          address: placeDetails.formatted_address || null,
          category: place.types?.[0] || null,
          rating: place.rating || null,
          email: null as string | null,
          scraped_content: null as string | null
        };

        // Step 3: Extract email from website if available
        if (extract_emails && company.website) {
          try {
            const emailData = await extractEmailFromWebsite(company.website);
            company.email = emailData.email;
            company.scraped_content = emailData.content;
            
            if (company.email) {
              results.emailsExtracted++;
            }
          } catch (emailError) {
            console.warn(`Failed to extract email for ${company.name}:`, emailError);
          }
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
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (placeError) {
        results.errors.push(`Error processing ${place.name}: ${placeError}`);
      }
    }

    res.status(200).json({
      success: true,
      location,
      business_type,
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

async function getPlaceDetails(placeId: string, apiKey: string) {
  const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
    params: {
      place_id: placeId,
      key: apiKey,
      fields: 'place_id,name,formatted_address,formatted_phone_number,website,rating,business_status,types'
    }
  });

  if (response.data.status !== 'OK') {
    throw new Error(`Place Details API error: ${response.data.status}`);
  }

  return response.data.result;
}

async function extractEmailFromWebsite(website: string): Promise<{ email: string | null; content: string }> {
  try {
    // Use ScrapingBee if API key is available, otherwise use direct scraping
    if (process.env.SCRAPINGBEE_API_KEY) {
      return await extractWithScrapingBee(website);
    } else {
      return await extractWithDirectScraping(website);
    }
  } catch (error) {
    console.warn(`Email extraction failed for ${website}:`, error);
    return { email: null, content: '' };
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