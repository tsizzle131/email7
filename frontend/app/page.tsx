'use client'

import { useEffect, useState } from 'react'
import { StatsCard } from '@/components/StatsCard'
import { Chart } from '@/components/Chart'
import { RecentActivity } from '@/components/RecentActivity'
import { apiClient } from '@/lib/api'
import { Activity, BarChart3, Mail, Users, Database, TrendingUp } from 'lucide-react'

interface OverviewStats {
  scraping: {
    total: number
    today: number
    thisWeek: number
    lastScraped: number | null
  }
  emails: {
    totalCompanies: number
    companiesWithEmails: number
    extractionRate: string
    pendingExtraction: number
  }
  enrichment: {
    eligible: number
    enriched: number
    pending: number
    enrichmentRate: string
    costTracker: {
      totalTokensUsed: number
      totalCost: number
      requestCount: number
    }
  }
  knowledgeBase: {
    total: number
    byType: Record<string, number>
    recentlyAdded: number
  }
}

export default function Dashboard() {
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await apiClient.get('/api/stats/overview')
      setStats(response.data.stats)
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-500"></div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400">
        Failed to load dashboard data
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Overview of your email agent system performance
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Companies Scraped"
          value={stats.scraping.total.toLocaleString()}
          change={`+${stats.scraping.today} today`}
          icon={<Database className="h-6 w-6" />}
          trend="up"
        />
        <StatsCard
          title="Email Extraction Rate"
          value={`${stats.emails.extractionRate}%`}
          change={`${stats.emails.companiesWithEmails}/${stats.emails.totalCompanies} companies`}
          icon={<Mail className="h-6 w-6" />}
          trend="up"
        />
        <StatsCard
          title="Data Enrichment"
          value={`${stats.enrichment.enrichmentRate}%`}
          change={`${stats.enrichment.pending} pending`}
          icon={<TrendingUp className="h-6 w-6" />}
          trend="up"
        />
        <StatsCard
          title="Knowledge Base"
          value={stats.knowledgeBase.total.toString()}
          change={`+${stats.knowledgeBase.recentlyAdded} this week`}
          icon={<BarChart3 className="h-6 w-6" />}
          trend="up"
        />
      </div>

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Chart />
        </div>
        <div className="lg:col-span-1">
          <RecentActivity />
        </div>
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enrichment Cost Analysis */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Cost Analysis
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Total OpenAI Cost</span>
              <span className="font-medium">${stats.enrichment.costTracker.totalCost.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Tokens Used</span>
              <span className="font-medium">{stats.enrichment.costTracker.totalTokensUsed.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">API Requests</span>
              <span className="font-medium">{stats.enrichment.costTracker.requestCount}</span>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="text-gray-600 dark:text-gray-400">Avg Cost/Company</span>
              <span className="font-medium">
                ${stats.enrichment.costTracker.requestCount > 0 
                  ? (stats.enrichment.costTracker.totalCost / stats.enrichment.costTracker.requestCount).toFixed(4)
                  : '0.0000'
                }
              </span>
            </div>
          </div>
        </div>

        {/* Knowledge Base Breakdown */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Knowledge Base
          </h3>
          <div className="space-y-3">
            {Object.entries(stats.knowledgeBase.byType).map(([type, count]) => (
              <div key={type} className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400 capitalize">
                  {type.replace('_', ' ')}
                </span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
            {Object.keys(stats.knowledgeBase.byType).length === 0 && (
              <p className="text-gray-500 text-sm">No documents found</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}