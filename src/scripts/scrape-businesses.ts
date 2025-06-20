#!/usr/bin/env tsx

import dotenv from 'dotenv';
import { GoogleMapsService } from '../services/google-maps';
import { WebsiteScraperService } from '../services/website-scraper';
import { ScrapingConfig } from '../types';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: npm run scrape -- <location> [business_type] [max_results]');
    console.log('Example: npm run scrape -- "New York, NY" "restaurants" 50');
    process.exit(1);
  }

  const location = args[0];
  const business_type = args[1];
  const max_results = args[2] ? parseInt(args[2]) : 20;

  const config: ScrapingConfig = {
    location,
    business_type,
    max_results,
    exclude_chains: true
  };

  console.log('🔍 Starting business scraping...');
  console.log('Config:', JSON.stringify(config, null, 2));

  try {
    // Initialize services
    const googleMapsService = new GoogleMapsService();
    const websiteScraperService = new WebsiteScraperService();

    // Scrape businesses from Google Maps
    console.log('\n📍 Scraping businesses from Google Maps...');
    const companies = await googleMapsService.searchBusinesses(config);
    console.log(`✅ Found ${companies.length} businesses`);

    if (companies.length === 0) {
      console.log('No businesses found. Try adjusting your search criteria.');
      return;
    }

    // Initialize website scraper
    await websiteScraperService.initialize();

    // Extract emails from websites
    console.log('\n📧 Extracting emails from websites...');
    await websiteScraperService.scrapeCompanyEmails();

    // Get final stats
    const emailStats = await websiteScraperService.getEmailExtractionStats();
    console.log('\n📊 Final Statistics:');
    console.log(`- Total companies with websites: ${emailStats.totalCompanies}`);
    console.log(`- Companies with emails: ${emailStats.companiesWithEmails}`);
    console.log(`- Email extraction rate: ${emailStats.extractionRate}%`);
    console.log(`- Pending extraction: ${emailStats.pendingExtraction}`);

    // Close browser
    await websiteScraperService.close();

    console.log('\n✅ Scraping completed successfully!');
  } catch (error) {
    console.error('❌ Error during scraping:', error);
    process.exit(1);
  }
}

main();