# Email Agent System

An AI-powered email outreach and lead generation platform that automates business discovery, data enrichment, and email campaigns.

## Features

### 🔍 Business Discovery
- **Google Maps Integration**: Scrape businesses by location and industry
- **Website Analysis**: Extract contact information from company websites
- **Email Discovery**: Intelligent email extraction with validation
- **Data Quality**: Automatic filtering and validation of business data

### 🧠 AI-Powered Data Enrichment
- **Cost-Optimized**: GPT-3.5 Turbo integration with cost controls (<$0.10/company)
- **Smart Caching**: Avoid duplicate enrichment with intelligent caching
- **Comprehensive Analysis**: Industry, company size, services, pain points
- **Website Intelligence**: Extract structured data from scraped content

### 📧 Email Automation
- **Multi-Account Gmail**: OAuth integration for multiple Gmail accounts
- **Smart Campaigns**: Personalized email templates with company data
- **Follow-up Sequences**: Automated 2x/week follow-ups for 6 weeks
- **Response Detection**: Automatic conversation threading and management

### 🤖 RAG-Powered Sales Agent
- **Knowledge Base**: Vector embeddings for company information
- **Context-Aware**: Intelligent responses using stored knowledge
- **Conversation Management**: Handle prospect responses like a sales rep
- **Escalation Rules**: Smart handoff for complex inquiries

### 📊 Analytics Dashboard
- **Real-time Stats**: Live tracking of scraping, enrichment, and campaigns
- **Cost Monitoring**: Track OpenAI usage and costs
- **Performance Metrics**: Email open rates, response rates, conversion tracking
- **Interactive Charts**: Visualize trends and campaign performance

## Tech Stack

### Backend
- **Node.js/TypeScript**: Core application logic
- **Express**: REST API framework
- **Supabase**: PostgreSQL database with vector extensions
- **Puppeteer**: Website scraping and automation
- **OpenAI GPT-3.5**: Data enrichment and AI responses
- **Gmail API**: Email sending and management

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type safety throughout
- **Tailwind CSS**: Utility-first styling
- **Recharts**: Data visualization
- **Zustand**: State management

### Infrastructure
- **Supabase**: Database, authentication, real-time subscriptions
- **Vector Database**: pgvector for RAG embeddings
- **Rate Limiting**: API protection and cost control
- **Logging**: Winston for comprehensive logging

## Quick Start

### 1. Setup Environment

```bash
# Clone the repository
git clone <repository-url>
cd email-agent-system

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Fill in your API keys and configuration
```

### 2. Database Setup

```bash
# Run the database schema
psql -d your_supabase_db -f database/schema.sql

# Or use Supabase dashboard to run the SQL
```

### 3. Configure APIs

Add these environment variables to your `.env`:

```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# Google APIs
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
```

### 4. Start the Application

```bash
# Start the backend server
npm run dev

# In another terminal, start the frontend
cd frontend
npm install
npm run dev
```

### 5. Access the Dashboard

Open [http://localhost:3001](http://localhost:3001) to access the dashboard.

## Usage

### Business Scraping
```bash
# Scrape businesses from Google Maps
npm run scrape -- "New York, NY" "tech companies" 50

# Extract emails from scraped websites
npm run scrape -- check-emails
```

### Data Enrichment
```bash
# Enrich company data with AI
npm run enrich -- 20  # Process 20 companies

# Check enrichment stats
npm run enrich -- stats
```

### Email Campaigns
```bash
# Check for email replies
npm run send-emails -- check-replies <account_id>

# Process follow-ups
npm run send-emails -- follow-ups

# Get campaign statistics
npm run send-emails -- campaign-stats [campaign_id]
```

### Automation
```bash
# Start cron scheduler for automation
npm run dev:cron
```

## API Endpoints

### Business Data
- `POST /api/scrape/businesses` - Scrape businesses from Google Maps
- `POST /api/scrape/emails` - Extract emails from websites
- `POST /api/enrich/companies` - Enrich company data with AI

### Email Management
- `POST /api/gmail/auth` - Authenticate Gmail account
- `POST /api/campaigns` - Create email campaign
- `POST /api/campaigns/:id/start` - Start campaign
- `GET /api/campaigns/:id/stats` - Get campaign statistics

### Knowledge Base
- `POST /api/knowledge-base` - Add document to RAG database
- `GET /api/knowledge-base` - Get all documents
- `POST /api/knowledge-base/search` - Search documents

### Analytics
- `GET /api/stats/overview` - Get system overview statistics

## Architecture

### Data Flow
1. **Discovery**: Google Maps API → Business data
2. **Extraction**: Website scraping → Email addresses
3. **Enrichment**: GPT-3.5 + website content → Structured data
4. **Storage**: Supabase PostgreSQL with vector embeddings
5. **Campaigns**: Gmail API + RAG context → Personalized emails
6. **Automation**: Cron jobs → Follow-ups and maintenance

### Cost Optimization
- **Caching**: Avoid duplicate API calls
- **Batch Processing**: Process multiple companies efficiently
- **Rate Limiting**: Respect API limits and reduce costs
- **Smart Filtering**: Only enrich high-quality prospects

### Security
- **OAuth 2.0**: Secure Gmail integration
- **Rate Limiting**: Protect against abuse
- **Environment Variables**: Secure API key management
- **Input Validation**: Prevent injection attacks

## Monitoring

### Logs
- Application logs: `logs/app.log`
- Service-specific logs: `logs/gmail.log`, `logs/enrichment.log`
- Cron job logs: `logs/cron.log`

### Analytics
- Real-time dashboard with key metrics
- Cost tracking for OpenAI usage
- Email campaign performance
- System health monitoring

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

Private - All rights reserved

## Support

For issues or questions, please create an issue in the repository.