import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import winston from 'winston';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Import services
import { GoogleMapsService } from '../src/services/google-maps';
import { WebsiteScraperService } from '../src/services/website-scraper';
import { DataEnrichmentService } from '../src/services/data-enrichment';
import { GmailService } from '../src/services/gmail-service';
import { RAGDatabaseService } from '../src/services/rag-database';

// Load environment variables
dotenv.config();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Rate limiter for API endpoints
const rateLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60 * 15, // 15 minutes
});

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting middleware
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch (rejRes) {
    res.status(429).json({ error: 'Too many requests' });
  }
});

// Initialize services (lazy loading for serverless)
let googleMapsService: GoogleMapsService;
let websiteScraperService: WebsiteScraperService;
let dataEnrichmentService: DataEnrichmentService;
let gmailService: GmailService;
let ragService: RAGDatabaseService;

const initServices = () => {
  if (!googleMapsService) {
    googleMapsService = new GoogleMapsService();
    dataEnrichmentService = new DataEnrichmentService();
    gmailService = new GmailService();
    ragService = new RAGDatabaseService();
  }
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Email Agent API', 
    status: 'running',
    version: '1.0.0' 
  });
});

// Scraping endpoints
app.post('/api/scrape/businesses', async (req, res) => {
  try {
    initServices();
    const { location, business_type, radius, max_results, exclude_chains } = req.body;
    
    const config = {
      location,
      business_type,
      radius,
      max_results,
      exclude_chains
    };

    const companies = await googleMapsService.searchBusinesses(config);
    
    res.json({
      success: true,
      count: companies.length,
      companies: companies.slice(0, 10) // Return first 10 for response
    });
  } catch (error) {
    logger.error('Error in /api/scrape/businesses:', error);
    res.status(500).json({ error: 'Failed to scrape businesses' });
  }
});

app.post('/api/scrape/emails', async (req, res) => {
  try {
    // Initialize website scraper for serverless
    websiteScraperService = new WebsiteScraperService();
    await websiteScraperService.initialize();
    
    await websiteScraperService.scrapeCompanyEmails();
    const stats = await websiteScraperService.getEmailExtractionStats();
    
    // Clean up
    await websiteScraperService.close();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Error in /api/scrape/emails:', error);
    res.status(500).json({ error: 'Failed to scrape emails' });
  }
});

// Enrichment endpoints
app.post('/api/enrich/companies', async (req, res) => {
  try {
    initServices();
    const { batch_size = 10 } = req.body;
    
    await dataEnrichmentService.enrichCompanyData(batch_size);
    const stats = await dataEnrichmentService.getEnrichmentStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Error in /api/enrich/companies:', error);
    res.status(500).json({ error: 'Failed to enrich companies' });
  }
});

app.post('/api/enrich/company/:id', async (req, res) => {
  try {
    initServices();
    const { id } = req.params;
    const enrichedData = await dataEnrichmentService.enrichSpecificCompany(id);
    
    res.json({
      success: true,
      enrichedData
    });
  } catch (error) {
    logger.error(`Error in /api/enrich/company/${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to enrich company' });
  }
});

// Gmail/Email endpoints
app.post('/api/gmail/auth', async (req, res) => {
  try {
    initServices();
    const { auth_code } = req.body;
    const account = await gmailService.authenticateAccount(auth_code);
    
    res.json({
      success: true,
      account: {
        id: account.id,
        email: account.email,
        account_name: account.account_name,
        status: account.status
      }
    });
  } catch (error) {
    logger.error('Error in /api/gmail/auth:', error);
    res.status(500).json({ error: 'Failed to authenticate Gmail account' });
  }
});

app.post('/api/campaigns', async (req, res) => {
  try {
    initServices();
    const { name, accountId, companyIds, template } = req.body;
    
    const campaign = await gmailService.createEmailCampaign({
      name,
      accountId,
      companyIds,
      template
    });
    
    res.json({
      success: true,
      campaign
    });
  } catch (error) {
    logger.error('Error in /api/campaigns:', error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

app.post('/api/campaigns/:id/start', async (req, res) => {
  try {
    initServices();
    const { id } = req.params;
    await gmailService.startCampaign(id);
    
    res.json({
      success: true,
      message: 'Campaign started successfully'
    });
  } catch (error) {
    logger.error(`Error in /api/campaigns/${req.params.id}/start:`, error);
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

app.get('/api/campaigns/:id/stats', async (req, res) => {
  try {
    initServices();
    const { id } = req.params;
    const stats = await gmailService.getCampaignStats(id);
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error(`Error in /api/campaigns/${req.params.id}/stats:`, error);
    res.status(500).json({ error: 'Failed to get campaign stats' });
  }
});

// Knowledge base endpoints
app.post('/api/knowledge-base', async (req, res) => {
  try {
    initServices();
    const { title, content, document_type } = req.body;
    
    const id = await ragService.addDocument({
      title,
      content,
      document_type
    });
    
    res.json({
      success: true,
      id
    });
  } catch (error) {
    logger.error('Error in /api/knowledge-base:', error);
    res.status(500).json({ error: 'Failed to add document' });
  }
});

app.get('/api/knowledge-base', async (req, res) => {
  try {
    initServices();
    const { document_type } = req.query;
    const documents = await ragService.getAllDocuments(document_type as string);
    
    res.json({
      success: true,
      documents
    });
  } catch (error) {
    logger.error('Error in GET /api/knowledge-base:', error);
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

app.post('/api/knowledge-base/search', async (req, res) => {
  try {
    initServices();
    const { query, document_type, limit = 5 } = req.body;
    
    const results = await ragService.searchSimilarDocuments(query, document_type, limit);
    
    res.json({
      success: true,
      results
    });
  } catch (error) {
    logger.error('Error in /api/knowledge-base/search:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
});

// Stats endpoints
app.get('/api/stats/overview', async (req, res) => {
  try {
    initServices();
    
    // Initialize website scraper for stats
    const tempWebsiteScraperService = new WebsiteScraperService();
    
    const [scrapingStats, emailStats, enrichmentStats, ragStats] = await Promise.all([
      googleMapsService.getScrapingStats(),
      tempWebsiteScraperService.getEmailExtractionStats(),
      dataEnrichmentService.getEnrichmentStats(),
      ragService.getKnowledgeBaseStats()
    ]);

    res.json({
      success: true,
      stats: {
        scraping: scrapingStats,
        emails: emailStats,
        enrichment: enrichmentStats,
        knowledgeBase: ragStats
      }
    });
  } catch (error) {
    logger.error('Error in /api/stats/overview:', error);
    res.status(500).json({ error: 'Failed to get overview stats' });
  }
});

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// For Vercel serverless functions
export default app;