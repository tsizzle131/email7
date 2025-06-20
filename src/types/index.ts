export interface Company {
  id: string;
  name: string;
  website?: string;
  email?: string;
  phone?: string;
  address?: string;
  category?: string;
  rating?: number;
  scraped_content?: string;
  enriched_data?: EnrichedData;
  scraped_at?: Date;
  enriched_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface EnrichedData {
  industry?: string;
  company_size?: string;
  key_personnel?: string[];
  services?: string[];
  pain_points?: string[];
  recent_news?: string[];
  social_media?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
  };
  technology_stack?: string[];
  competitors?: string[];
  summary?: string;
}

export interface EmailAccount {
  id: string;
  email: string;
  oauth_tokens: {
    access_token: string;
    refresh_token: string;
    scope: string;
    token_type: string;
    expiry_date: number;
  };
  account_name: string;
  status: 'active' | 'inactive' | 'error';
  created_at: Date;
  updated_at: Date;
}

export interface EmailCampaign {
  id: string;
  name: string;
  company_count: number;
  status: 'draft' | 'active' | 'paused' | 'completed';
  template_id?: string;
  account_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface EmailThread {
  id: string;
  campaign_id: string;
  company_id: string;
  email_content: string;
  subject: string;
  sent_at?: Date;
  response_received: boolean;
  conversation_status: 'pending' | 'responded' | 'closed';
  follow_up_count: number;
  next_follow_up?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Conversation {
  id: string;
  thread_id: string;
  message_content: string;
  sender: 'ai' | 'human' | 'prospect';
  timestamp: Date;
  ai_response?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  rag_context?: string[];
  confidence_score?: number;
}

export interface KnowledgeBase {
  id: string;
  title: string;
  content: string;
  document_type: 'company_info' | 'product' | 'case_study' | 'faq' | 'pricing';
  embedding?: number[];
  created_at: Date;
  updated_at: Date;
}

export interface ScrapingConfig {
  location: string;
  business_type?: string;
  radius?: number;
  max_results?: number;
  exclude_chains?: boolean;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  variables: string[];
  template_type: 'initial' | 'follow_up' | 'response';
  created_at: Date;
  updated_at: Date;
}