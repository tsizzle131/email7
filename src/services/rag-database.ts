import OpenAI from 'openai';
import { supabase } from '@/config/database';
import { KnowledgeBase } from '@/types';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/rag.log' }),
    new winston.transports.Console()
  ]
});

export class RAGDatabaseService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    });
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is required for RAG database');
    }
  }

  async addDocument(document: {
    title: string;
    content: string;
    document_type: 'company_info' | 'product' | 'case_study' | 'faq' | 'pricing';
  }): Promise<string> {
    try {
      // Generate embedding for the document
      const embedding = await this.generateEmbedding(document.content);
      
      // Save to database
      const { data, error } = await supabase
        .from('knowledge_base')
        .insert({
          title: document.title,
          content: document.content,
          document_type: document.document_type,
          embedding: embedding
        })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      logger.info(`Added document to RAG database: ${document.title}`);
      return data.id;
    } catch (error) {
      logger.error('Error adding document to RAG database:', error);
      throw error;
    }
  }

  async searchSimilarDocuments(
    query: string, 
    documentType?: string, 
    limit: number = 5,
    threshold: number = 0.7
  ): Promise<KnowledgeBase[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Build the SQL query
      let sqlQuery = supabase
        .from('knowledge_base')
        .select('*')
        .order('created_at', { ascending: false });

      // Add document type filter if specified
      if (documentType) {
        sqlQuery = sqlQuery.eq('document_type', documentType);
      }

      // Execute the query
      const { data, error } = await sqlQuery;

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Calculate similarity scores and filter
      const documentsWithScores = data
        .map(doc => ({
          ...doc,
          similarity: this.calculateCosineSimilarity(queryEmbedding, doc.embedding || [])
        }))
        .filter(doc => doc.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);

      logger.info(`Found ${documentsWithScores.length} similar documents for query: ${query.substring(0, 50)}...`);
      
      return documentsWithScores.map(doc => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        document_type: doc.document_type as any,
        embedding: doc.embedding,
        created_at: new Date(doc.created_at),
        updated_at: new Date(doc.updated_at)
      }));
    } catch (error) {
      logger.error('Error searching similar documents:', error);
      throw error;
    }
  }

  async getContextForQuery(query: string, maxTokens: number = 2000): Promise<{
    context: string;
    sources: string[];
  }> {
    try {
      const similarDocs = await this.searchSimilarDocuments(query, undefined, 10, 0.6);
      
      if (similarDocs.length === 0) {
        return { context: '', sources: [] };
      }

      let context = '';
      const sources: string[] = [];
      let currentTokens = 0;

      for (const doc of similarDocs) {
        const docContent = `\n--- ${doc.title} ---\n${doc.content}\n`;
        const docTokens = this.estimateTokens(docContent);
        
        if (currentTokens + docTokens > maxTokens) {
          break;
        }
        
        context += docContent;
        sources.push(doc.title);
        currentTokens += docTokens;
      }

      logger.info(`Generated context from ${sources.length} documents for query`);
      
      return { context, sources };
    } catch (error) {
      logger.error('Error getting context for query:', error);
      return { context: '', sources: [] };
    }
  }

  async updateDocument(id: string, updates: {
    title?: string;
    content?: string;
    document_type?: 'company_info' | 'product' | 'case_study' | 'faq' | 'pricing';
  }): Promise<void> {
    try {
      const updateData: any = { ...updates };
      
      // If content is being updated, regenerate embedding
      if (updates.content) {
        updateData.embedding = await this.generateEmbedding(updates.content);
      }
      
      updateData.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('knowledge_base')
        .update(updateData)
        .eq('id', id);

      if (error) {
        throw error;
      }

      logger.info(`Updated document in RAG database: ${id}`);
    } catch (error) {
      logger.error('Error updating document:', error);
      throw error;
    }
  }

  async deleteDocument(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('knowledge_base')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      logger.info(`Deleted document from RAG database: ${id}`);
    } catch (error) {
      logger.error('Error deleting document:', error);
      throw error;
    }
  }

  async getAllDocuments(documentType?: string): Promise<KnowledgeBase[]> {
    try {
      let query = supabase
        .from('knowledge_base')
        .select('*')
        .order('created_at', { ascending: false });

      if (documentType) {
        query = query.eq('document_type', documentType);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []).map(doc => ({
        id: doc.id,
        title: doc.title,
        content: doc.content,
        document_type: doc.document_type as any,
        embedding: doc.embedding,
        created_at: new Date(doc.created_at),
        updated_at: new Date(doc.updated_at)
      }));
    } catch (error) {
      logger.error('Error getting all documents:', error);
      throw error;
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.substring(0, 8000) // Limit input length
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw error;
    }
  }

  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  async initializeDefaultKnowledgeBase(): Promise<void> {
    try {
      // Check if knowledge base is already initialized
      const { data: existing } = await supabase
        .from('knowledge_base')
        .select('id')
        .limit(1);

      if (existing && existing.length > 0) {
        logger.info('Knowledge base already initialized');
        return;
      }

      // Add default company information
      const defaultDocuments = [
        {
          title: 'Company Overview',
          content: `Our company specializes in helping businesses grow through targeted email outreach and lead generation. 
          We provide comprehensive solutions including business discovery, data enrichment, and automated email campaigns.
          Our AI-powered platform ensures personalized communication that drives results.`,
          document_type: 'company_info' as const
        },
        {
          title: 'Services Offered',
          content: `We offer the following services:
          1. Business Discovery & Lead Generation - Find potential customers using advanced scraping techniques
          2. Data Enrichment - Enhance your prospect data with AI-powered research
          3. Email Campaign Automation - Automated follow-up sequences with personalized messaging
          4. AI Sales Assistant - Intelligent conversation handling for prospect responses
          5. Analytics & Reporting - Comprehensive insights into campaign performance`,
          document_type: 'product' as const
        },
        {
          title: 'Common Questions & Objections',
          content: `Common customer questions and how to address them:
          Q: How do you ensure email deliverability?
          A: We use authenticated email sending, proper warm-up sequences, and follow best practices for email marketing.
          
          Q: Is this compliant with anti-spam laws?
          A: Yes, we ensure all campaigns comply with CAN-SPAM, GDPR, and other relevant regulations.
          
          Q: What's your success rate?
          A: Our clients typically see 15-25% open rates and 2-5% response rates, depending on the industry and targeting.
          
          Q: How quickly can we see results?
          A: Most clients start seeing responses within the first week of launching their campaigns.`,
          document_type: 'faq' as const
        }
      ];

      for (const doc of defaultDocuments) {
        await this.addDocument(doc);
      }

      logger.info('Default knowledge base initialized successfully');
    } catch (error) {
      logger.error('Error initializing default knowledge base:', error);
      throw error;
    }
  }

  async getKnowledgeBaseStats(): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('document_type, created_at');

      if (error) {
        throw error;
      }

      const stats = {
        total: data?.length || 0,
        byType: {} as Record<string, number>,
        recentlyAdded: 0
      };

      if (data) {
        // Count by document type
        data.forEach(doc => {
          stats.byType[doc.document_type] = (stats.byType[doc.document_type] || 0) + 1;
        });

        // Count recently added (last 7 days)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        stats.recentlyAdded = data.filter(doc => 
          new Date(doc.created_at) > weekAgo
        ).length;
      }

      return stats;
    } catch (error) {
      logger.error('Error getting knowledge base stats:', error);
      throw error;
    }
  }
}