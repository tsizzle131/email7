import OpenAI from 'openai';
import { supabase } from '@/config/database';
import { Company, EnrichedData } from '@/types';
import { createHash } from 'crypto';
import winston from 'winston';
import { RateLimiterMemory } from 'rate-limiter-flexible';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/enrichment.log' }),
    new winston.transports.Console()
  ]
});

// Rate limiter for OpenAI API to control costs
const openaiRateLimiter = new RateLimiterMemory({
  points: 50, // Number of requests
  duration: 3600, // Per hour
});

export class DataEnrichmentService {
  private openai: OpenAI;
  private costTracker = {
    totalTokensUsed: 0,
    totalCost: 0,
    requestCount: 0
  };

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is required for data enrichment');
    }
  }

  async enrichCompanyData(batchSize: number = 10): Promise<void> {
    try {
      // Get companies that need enrichment
      const { data: companies, error } = await supabase
        .from('companies')
        .select('*')
        .not('scraped_content', 'is', null)
        .is('enriched_data', null)
        .not('email', 'is', null) // Only enrich companies with emails
        .limit(batchSize);

      if (error) {
        throw error;
      }

      if (!companies || companies.length === 0) {
        logger.info('No companies found for enrichment');
        return;
      }

      logger.info(`Processing ${companies.length} companies for enrichment`);

      // Process companies in smaller batches to optimize costs
      const smallBatchSize = 3;
      for (let i = 0; i < companies.length; i += smallBatchSize) {
        const batch = companies.slice(i, i + smallBatchSize);
        await this.processBatch(batch);
        
        // Small delay between batches to respect rate limits
        await this.delay(1000);
      }

      logger.info(`Enrichment complete. Cost tracker: ${JSON.stringify(this.costTracker)}`);
    } catch (error) {
      logger.error('Error in enrichCompanyData:', error);
      throw error;
    }
  }

  private async processBatch(companies: any[]): Promise<void> {
    for (const company of companies) {
      try {
        await openaiRateLimiter.consume('openai-request');
        
        // Check cache first to avoid duplicate enrichment
        const cachedData = await this.getCachedEnrichment(company.website);
        if (cachedData) {
          await this.updateCompanyWithEnrichment(company.id, cachedData);
          logger.info(`Used cached enrichment for ${company.name}`);
          continue;
        }

        const enrichedData = await this.enrichSingleCompany(company);
        if (enrichedData) {
          await this.updateCompanyWithEnrichment(company.id, enrichedData);
          await this.cacheEnrichment(company.website, enrichedData);
          logger.info(`Enriched ${company.name} - tokens used: ~${this.estimateTokensUsed(company)}`);
        }
      } catch (error) {
        logger.error(`Error enriching ${company.name}:`, error);
      }
    }
  }

  private async enrichSingleCompany(company: any): Promise<EnrichedData | null> {
    try {
      // Parse scraped content
      let scrapedContent = '';
      try {
        const parsed = JSON.parse(company.scraped_content || '{}');
        scrapedContent = parsed.content || '';
      } catch {
        scrapedContent = company.scraped_content || '';
      }

      if (!scrapedContent || scrapedContent.length < 50) {
        logger.warn(`Insufficient content for enrichment: ${company.name}`);
        return null;
      }

      // Create cost-optimized prompt
      const prompt = this.createEnrichmentPrompt(company, scrapedContent);
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a business analyst. Analyze the provided company information and return structured data in JSON format. Be concise and focus on actionable insights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 500, // Limit response tokens to control costs
        temperature: 0.3 // Lower temperature for more consistent results
      });

      // Track usage for cost monitoring
      this.updateCostTracker(response.usage);

      const enrichedData = this.parseEnrichmentResponse(response.choices[0].message.content);
      return enrichedData;
    } catch (error) {
      logger.error(`Error in enrichSingleCompany for ${company.name}:`, error);
      return null;
    }
  }

  private createEnrichmentPrompt(company: any, scrapedContent: string): string {
    // Keep prompt concise to minimize token usage
    const limitedContent = scrapedContent.substring(0, 1500); // Limit input content
    
    return `Analyze this company and provide structured insights:

Company: ${company.name}
Website: ${company.website}
Location: ${company.address || 'Unknown'}
Content: ${limitedContent}

Return JSON with these fields (keep responses brief):
{
  "industry": "primary industry/sector",
  "company_size": "estimate (1-10, 11-50, 51-200, 200+)",
  "services": ["key service 1", "key service 2", "key service 3"],
  "pain_points": ["potential pain point 1", "potential pain point 2"],
  "key_personnel": ["key person/role if mentioned"],
  "summary": "2-sentence company summary",
  "target_persona": "likely decision maker role/title"
}`;
  }

  private parseEnrichmentResponse(content: string | null): EnrichedData | null {
    if (!content) return null;

    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.warn('No JSON found in enrichment response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and clean the response
      const enrichedData: EnrichedData = {
        industry: parsed.industry || undefined,
        company_size: parsed.company_size || undefined,
        services: Array.isArray(parsed.services) ? parsed.services.slice(0, 5) : undefined,
        pain_points: Array.isArray(parsed.pain_points) ? parsed.pain_points.slice(0, 3) : undefined,
        key_personnel: Array.isArray(parsed.key_personnel) ? parsed.key_personnel.slice(0, 3) : undefined,
        summary: parsed.summary || undefined
      };

      // Add target persona if provided
      if (parsed.target_persona) {
        enrichedData.key_personnel = enrichedData.key_personnel || [];
        enrichedData.key_personnel.push(parsed.target_persona);
      }

      return enrichedData;
    } catch (error) {
      logger.error('Error parsing enrichment response:', error);
      return null;
    }
  }

  private async updateCompanyWithEnrichment(companyId: string, enrichedData: EnrichedData): Promise<void> {
    const { error } = await supabase
      .from('companies')
      .update({
        enriched_data: enrichedData,
        enriched_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', companyId);

    if (error) {
      throw error;
    }

    // Update analytics
    await this.updateAnalytics('companies_enriched', 1);
  }

  private async getCachedEnrichment(website: string): Promise<EnrichedData | null> {
    if (!website) return null;

    try {
      const websiteHash = createHash('sha256').update(website).digest('hex');
      
      const { data, error } = await supabase
        .from('enrichment_cache')
        .select('enriched_data')
        .eq('website_hash', websiteHash)
        .single();

      if (error || !data) {
        return null;
      }

      return data.enriched_data as EnrichedData;
    } catch (error) {
      return null;
    }
  }

  private async cacheEnrichment(website: string, enrichedData: EnrichedData): Promise<void> {
    if (!website) return;

    try {
      const websiteHash = createHash('sha256').update(website).digest('hex');
      
      await supabase
        .from('enrichment_cache')
        .upsert({
          website_hash: websiteHash,
          enriched_data: enrichedData
        });
    } catch (error) {
      logger.error('Error caching enrichment:', error);
    }
  }

  private updateCostTracker(usage: any): void {
    if (usage) {
      this.costTracker.totalTokensUsed += usage.total_tokens || 0;
      this.costTracker.requestCount += 1;
      
      // GPT-3.5-turbo pricing: $0.0015 per 1K prompt tokens, $0.002 per 1K completion tokens
      const promptCost = (usage.prompt_tokens || 0) * 0.0015 / 1000;
      const completionCost = (usage.completion_tokens || 0) * 0.002 / 1000;
      this.costTracker.totalCost += promptCost + completionCost;
    }
  }

  private estimateTokensUsed(company: any): number {
    const content = company.scraped_content || '';
    const prompt = this.createEnrichmentPrompt(company, content.substring(0, 1500));
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil((prompt.length + 500) / 4); // +500 for expected response
  }

  private async updateAnalytics(metric: string, value: number): Promise<void> {
    const { error } = await supabase
      .from('analytics')
      .insert({
        metric_name: metric,
        value,
        date: new Date().toISOString().split('T')[0]
      });

    if (error) {
      logger.error(`Error updating analytics for ${metric}:`, error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getEnrichmentStats(): Promise<any> {
    const { data, error } = await supabase
      .from('companies')
      .select('enriched_data, enriched_at, scraped_content, email')
      .not('scraped_content', 'is', null)
      .not('email', 'is', null);

    if (error) {
      throw error;
    }

    const eligible = data?.length || 0;
    const enriched = data?.filter(c => c.enriched_data).length || 0;
    const pending = eligible - enriched;

    return {
      eligible,
      enriched,
      pending,
      enrichmentRate: eligible > 0 ? ((enriched / eligible) * 100).toFixed(1) : '0',
      costTracker: this.costTracker,
      estimatedCostPerCompany: this.costTracker.requestCount > 0 ? 
        (this.costTracker.totalCost / this.costTracker.requestCount).toFixed(4) : '0'
    };
  }

  async enrichSpecificCompany(companyId: string): Promise<EnrichedData | null> {
    const { data: company, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (error || !company) {
      throw new Error('Company not found');
    }

    const enrichedData = await this.enrichSingleCompany(company);
    if (enrichedData) {
      await this.updateCompanyWithEnrichment(companyId, enrichedData);
    }

    return enrichedData;
  }
}