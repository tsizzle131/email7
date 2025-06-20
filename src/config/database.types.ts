export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          website: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          category: string | null;
          rating: number | null;
          scraped_content: string | null;
          enriched_data: any | null;
          scraped_at: string | null;
          enriched_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          website?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          category?: string | null;
          rating?: number | null;
          scraped_content?: string | null;
          enriched_data?: any | null;
          scraped_at?: string | null;
          enriched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          website?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          category?: string | null;
          rating?: number | null;
          scraped_content?: string | null;
          enriched_data?: any | null;
          scraped_at?: string | null;
          enriched_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      email_accounts: {
        Row: {
          id: string;
          email: string;
          oauth_tokens: any;
          account_name: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          oauth_tokens: any;
          account_name: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          oauth_tokens?: any;
          account_name?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      email_campaigns: {
        Row: {
          id: string;
          name: string;
          company_count: number;
          status: string;
          template_id: string | null;
          account_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          company_count?: number;
          status?: string;
          template_id?: string | null;
          account_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          company_count?: number;
          status?: string;
          template_id?: string | null;
          account_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      email_threads: {
        Row: {
          id: string;
          campaign_id: string;
          company_id: string;
          email_content: string;
          subject: string;
          sent_at: string | null;
          response_received: boolean;
          conversation_status: string;
          follow_up_count: number;
          next_follow_up: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          company_id: string;
          email_content: string;
          subject: string;
          sent_at?: string | null;
          response_received?: boolean;
          conversation_status?: string;
          follow_up_count?: number;
          next_follow_up?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          company_id?: string;
          email_content?: string;
          subject?: string;
          sent_at?: string | null;
          response_received?: boolean;
          conversation_status?: string;
          follow_up_count?: number;
          next_follow_up?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          thread_id: string;
          message_content: string;
          sender: string;
          timestamp: string;
          ai_response: string | null;
          sentiment: string | null;
          rag_context: string[] | null;
          confidence_score: number | null;
        };
        Insert: {
          id?: string;
          thread_id: string;
          message_content: string;
          sender: string;
          timestamp?: string;
          ai_response?: string | null;
          sentiment?: string | null;
          rag_context?: string[] | null;
          confidence_score?: number | null;
        };
        Update: {
          id?: string;
          thread_id?: string;
          message_content?: string;
          sender?: string;
          timestamp?: string;
          ai_response?: string | null;
          sentiment?: string | null;
          rag_context?: string[] | null;
          confidence_score?: number | null;
        };
      };
      knowledge_base: {
        Row: {
          id: string;
          title: string;
          content: string;
          document_type: string;
          embedding: number[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          content: string;
          document_type: string;
          embedding?: number[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          content?: string;
          document_type?: string;
          embedding?: number[] | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      analytics: {
        Row: {
          id: string;
          metric_name: string;
          value: number;
          date: string;
          campaign_id: string | null;
        };
        Insert: {
          id?: string;
          metric_name: string;
          value: number;
          date?: string;
          campaign_id?: string | null;
        };
        Update: {
          id?: string;
          metric_name?: string;
          value?: number;
          date?: string;
          campaign_id?: string | null;
        };
      };
    };
  };
}