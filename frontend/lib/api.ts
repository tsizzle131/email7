import { ApiResponse, OverviewStats, CompanyListResponse, CompanyFilters, ScrapingConfig, ScrapingResult, EmailExtractionResult, AnalyticsData } from './types'

class ApiClient {
  private baseURL: string

  constructor() {
    // In production, use relative URLs (same domain)
    // In development, use localhost
    this.baseURL = process.env.NODE_ENV === 'production' 
      ? '' 
      : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('API request failed:', error)
      throw error
    }
  }

  // ============================================================
  // Generic HTTP Methods
  // ============================================================
  
  async get<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' })
  }

  async post<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T = any>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T = any>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }

  // ============================================================
  // Dashboard & Analytics
  // ============================================================

  async getDashboardStats(): Promise<{ stats: OverviewStats }> {
    return this.get('/api/stats/overview')
  }

  async getAnalytics(timeRange: string = '30d'): Promise<AnalyticsData> {
    return this.get(`/api/analytics?timeRange=${timeRange}`)
  }

  // ============================================================
  // Companies
  // ============================================================

  async getCompanies(filters: CompanyFilters = {}): Promise<CompanyListResponse> {
    const queryParams = new URLSearchParams()
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, String(value))
      }
    })

    return this.get(`/api/companies?${queryParams.toString()}`)
  }

  async getCompany(id: string) {
    return this.get(`/api/companies/${id}`)
  }

  async updateCompany(id: string, data: Partial<any>) {
    return this.put(`/api/companies/${id}`, data)
  }

  async deleteCompany(id: string) {
    return this.delete(`/api/companies/${id}`)
  }

  async bulkDeleteCompanies(ids: string[]) {
    return this.post('/api/companies/bulk-delete', { ids })
  }

  async exportCompanies(filters: CompanyFilters = {}) {
    return this.post('/api/companies/export', filters)
  }

  // ============================================================
  // Scraping
  // ============================================================

  async scrapeBusinesses(config: ScrapingConfig): Promise<ScrapingResult> {
    return this.post('/api/scrape/businesses', config)
  }

  async extractEmails(data: {
    company_ids?: string[]
    batch_size?: number
    use_scrapingbee?: boolean
    skip_existing?: boolean
  } = {}): Promise<{ results: EmailExtractionResult; summary: any }> {
    return this.post('/api/scrape/businesses?action=extract-emails', data)
  }

  // ============================================================
  // Enrichment
  // ============================================================

  async enrichCompanies(data: {
    company_ids?: string[]
    batch_size?: number
    custom_prompt?: string
  } = {}) {
    return this.post('/api/enrich/companies', data)
  }

  async getEnrichmentStats() {
    return this.get('/api/enrich/stats')
  }

  // ============================================================
  // Campaigns
  // ============================================================

  async getCampaigns() {
    return this.get('/api/campaigns')
  }

  async createCampaign(data: any) {
    return this.post('/api/campaigns', data)
  }

  async startCampaign(id: string) {
    return this.post(`/api/campaigns?action=start`, { campaign_id: id })
  }

  async getCampaignAnalytics(id?: string) {
    const endpoint = id ? `/api/campaigns/${id}/analytics` : '/api/campaigns/analytics'
    return this.get(endpoint)
  }

  // ============================================================
  // Gmail Integration
  // ============================================================

  async getGmailAuthUrl() {
    return this.get('/api/gmail/auth')
  }

  async handleGmailCallback(code: string) {
    return this.post('/api/gmail/auth', { code })
  }

  // ============================================================
  // System & Health
  // ============================================================

  async getSystemHealth() {
    return this.get('/api/health')
  }

  async triggerCronJob() {
    return this.post('/api/cron/master-scheduler')
  }
}

export const apiClient = new ApiClient()