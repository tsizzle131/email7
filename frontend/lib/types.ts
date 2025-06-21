// ============================================================
// API Response Types for Email Agent System
// ============================================================

// Base API Response Structure
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  errors?: string[];
}

// Pagination Metadata
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ============================================================
// Company Related Types
// ============================================================

export interface Company {
  id: string;
  name: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  category?: string;
  rating?: number;
  scraped_at?: string;
  scraped_content?: string;
  enriched_at?: string;
  enriched_data?: Record<string, any>;
  email_extracted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyListResponse {
  companies: Company[];
  pagination: PaginationMeta;
  filters: {
    totalCompanies: number;
    withEmails: number;
    enriched: number;
    categories: Record<string, number>;
  };
}

export interface CompanyFilters {
  search?: string;
  category?: string;
  has_email?: boolean;
  enriched?: boolean;
  page?: number;
  limit?: number;
}

// ============================================================
// Campaign Related Types
// ============================================================

export interface Campaign {
  id: string;
  name: string;
  account_id: string;
  status: 'draft' | 'active' | 'paused' | 'completed';
  company_ids: string[];
  template: EmailTemplate;
  filters: Record<string, any>;
  created_at: string;
  updated_at: string;
  sent_count: number;
  opened_count: number;
  replied_count: number;
}

export interface EmailTemplate {
  subject: string;
  body: string;
  variables: string[];
}

export interface CampaignStats {
  total_campaigns: number;
  active_campaigns: number;
  emails_sent_this_month: number;
  emails_opened_this_month: number;
  replies_received_this_month: number;
  average_open_rate: number;
  average_reply_rate: number;
}

// ============================================================
// Scraping Related Types
// ============================================================

export interface ScrapingConfig {
  location: string;
  business_type?: string;
  max_results?: number;
  extract_emails?: boolean;
  source?: 'google' | 'yelp' | 'yellowpages' | 'linkedin';
  exclude_chains?: boolean;
}

export interface ScrapingResult {
  success: boolean;
  location: string;
  business_type: string;
  source: string;
  results: {
    scraped: number;
    emailsExtracted: number;
    companies: Company[];
    errors: string[];
    fromCache: number;
  };
}

export interface EmailExtractionResult {
  processed: number;
  emailsFound: number;
  emailsUpdated: number;
  errors: Array<{
    company: string;
    error: string;
  }>;
}

// ============================================================
// Enrichment Related Types
// ============================================================

export interface EnrichmentResult {
  company_id: string;
  enriched_data: Record<string, any>;
  tokens_used: number;
  cost: number;
  processing_time: number;
  status: 'success' | 'failed' | 'skipped';
  error?: string;
}

export interface EnrichmentStats {
  eligible: number;
  enriched: number;
  pending: number;
  enrichmentRate: string;
  costTracker: {
    totalTokensUsed: number;
    totalCost: number;
    requestCount: number;
  };
}

// ============================================================
// Dashboard Stats Types
// ============================================================

export interface OverviewStats {
  scraping: {
    total: number;
    today: number;
    thisWeek: number;
    lastScraped: number | null;
  };
  emails: {
    totalCompanies: number;
    companiesWithEmails: number;
    extractionRate: string;
    pendingExtraction: number;
  };
  enrichment: EnrichmentStats;
  campaigns: CampaignStats;
  knowledgeBase: {
    total: number;
    byType: Record<string, number>;
    recentlyAdded: number;
  };
}

// ============================================================
// Analytics Types
// ============================================================

export interface AnalyticsData {
  timeRange: string;
  metrics: {
    companies_scraped: Array<{ date: string; count: number }>;
    emails_extracted: Array<{ date: string; count: number }>;
    campaigns_sent: Array<{ date: string; count: number }>;
    open_rates: Array<{ date: string; rate: number }>;
    reply_rates: Array<{ date: string; rate: number }>;
  };
  performance: {
    avg_scraping_time: number;
    avg_email_extraction_time: number;
    success_rates: {
      scraping: number;
      email_extraction: number;
      enrichment: number;
    };
  };
}

// ============================================================
// Activity Feed Types
// ============================================================

export interface ActivityItem {
  id: string;
  type: 'scraping' | 'email_extraction' | 'enrichment' | 'campaign' | 'system';
  title: string;
  description: string;
  status: 'success' | 'warning' | 'error' | 'info';
  timestamp: string;
  metadata?: Record<string, any>;
}

// ============================================================
// System Types
// ============================================================

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: 'online' | 'offline' | 'degraded';
    scrapingbee: 'online' | 'offline' | 'degraded';
    openai: 'online' | 'offline' | 'degraded';
    gmail: 'online' | 'offline' | 'degraded';
  };
  uptime: number;
  lastCheck: string;
}

// ============================================================
// UI Component Types
// ============================================================

export interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  gradient?: string;
  loading?: boolean;
}

export interface DataTableColumn<T> {
  key: keyof T;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  width?: string;
}

export interface FilterOption {
  label: string;
  value: string | boolean;
  count?: number;
}

// ============================================================
// Form Types
// ============================================================

export interface CreateCampaignForm {
  name: string;
  company_ids: string[];
  template: EmailTemplate;
  send_immediately?: boolean;
  schedule_date?: string;
}

export interface ScrapingForm {
  location: string;
  business_type: string;
  max_results: number;
  source: string;
  exclude_chains: boolean;
}

export interface EnrichmentForm {
  company_ids: string[];
  batch_size: number;
  custom_prompt?: string;
}

// ============================================================
// Settings Types
// ============================================================

export interface UserSettings {
  email_notifications: boolean;
  auto_refresh_dashboard: boolean;
  default_batch_size: number;
  preferred_scraping_source: string;
  theme: 'light' | 'dark' | 'auto';
}

export interface ApiConfiguration {
  scrapingbee_credits_remaining?: number;
  openai_usage_limit?: number;
  gmail_quota_remaining?: number;
  rate_limits: {
    scraping: number;
    enrichment: number;
    email_sending: number;
  };
}