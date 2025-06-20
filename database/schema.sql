-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Companies table
CREATE TABLE companies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    website VARCHAR(500),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    category VARCHAR(100),
    rating DECIMAL(2,1),
    scraped_content TEXT,
    enriched_data JSONB,
    scraped_at TIMESTAMP WITH TIME ZONE,
    enriched_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email accounts table
CREATE TABLE email_accounts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    oauth_tokens JSONB NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email campaigns table
CREATE TABLE email_campaigns (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    company_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    template_id UUID,
    account_id UUID NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Email threads table
CREATE TABLE email_threads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email_content TEXT NOT NULL,
    subject VARCHAR(255) NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    response_received BOOLEAN DEFAULT FALSE,
    conversation_status VARCHAR(20) DEFAULT 'pending' CHECK (conversation_status IN ('pending', 'responded', 'closed')),
    follow_up_count INTEGER DEFAULT 0,
    next_follow_up TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Conversations table
CREATE TABLE conversations (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
    message_content TEXT NOT NULL,
    sender VARCHAR(20) NOT NULL CHECK (sender IN ('ai', 'human', 'prospect')),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ai_response TEXT,
    sentiment VARCHAR(20) CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    rag_context TEXT[],
    confidence_score DECIMAL(3,2)
);

-- Knowledge base table with vector embeddings
CREATE TABLE knowledge_base (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('company_info', 'product', 'case_study', 'faq', 'pricing')),
    embedding vector(1536), -- OpenAI embeddings are 1536 dimensions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Analytics table
CREATE TABLE analytics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    value DECIMAL(12,2) NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE CASCADE
);

-- Company settings table
CREATE TABLE company_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    company_description TEXT,
    services TEXT[],
    target_industries TEXT[],
    pitch_templates JSONB,
    business_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enrichment cache table
CREATE TABLE enrichment_cache (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    website_hash VARCHAR(64) UNIQUE NOT NULL,
    enriched_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_companies_email ON companies(email);
CREATE INDEX idx_companies_website ON companies(website);
CREATE INDEX idx_companies_scraped_at ON companies(scraped_at);
CREATE INDEX idx_companies_enriched_at ON companies(enriched_at);

CREATE INDEX idx_email_threads_campaign_id ON email_threads(campaign_id);
CREATE INDEX idx_email_threads_company_id ON email_threads(company_id);
CREATE INDEX idx_email_threads_next_follow_up ON email_threads(next_follow_up);
CREATE INDEX idx_email_threads_status ON email_threads(conversation_status);

CREATE INDEX idx_conversations_thread_id ON conversations(thread_id);
CREATE INDEX idx_conversations_timestamp ON conversations(timestamp);

CREATE INDEX idx_knowledge_base_document_type ON knowledge_base(document_type);

CREATE INDEX idx_analytics_date ON analytics(date);
CREATE INDEX idx_analytics_campaign_id ON analytics(campaign_id);

-- Create a function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_accounts_updated_at BEFORE UPDATE ON email_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_campaigns_updated_at BEFORE UPDATE ON email_campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_threads_updated_at BEFORE UPDATE ON email_threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_company_settings_updated_at BEFORE UPDATE ON company_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Create policies (for now, allow all operations - you may want to restrict based on user auth)
CREATE POLICY "Allow all operations on companies" ON companies FOR ALL USING (true);
CREATE POLICY "Allow all operations on email_accounts" ON email_accounts FOR ALL USING (true);
CREATE POLICY "Allow all operations on email_campaigns" ON email_campaigns FOR ALL USING (true);
CREATE POLICY "Allow all operations on email_threads" ON email_threads FOR ALL USING (true);
CREATE POLICY "Allow all operations on conversations" ON conversations FOR ALL USING (true);
CREATE POLICY "Allow all operations on knowledge_base" ON knowledge_base FOR ALL USING (true);
CREATE POLICY "Allow all operations on analytics" ON analytics FOR ALL USING (true);
CREATE POLICY "Allow all operations on company_settings" ON company_settings FOR ALL USING (true);