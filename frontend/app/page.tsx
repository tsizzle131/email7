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
      <div className="space-y-6">
        {/* Loading header */}
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 opacity-10 rounded-2xl"></div>
          <div className="relative p-8 rounded-2xl backdrop-blur-sm">
            <div className="h-8 bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-lg animate-pulse mb-4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3"></div>
          </div>
        </div>
        
        {/* Loading stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2"></div>
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="text-gray-600 dark:text-gray-400 font-medium">Loading dashboard data...</span>
          </div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="min-h-64 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-red-100 dark:bg-red-900/20 rounded-full p-4 w-16 h-16 mx-auto mb-4">
            <Activity className="h-8 w-8 text-red-600 dark:text-red-400 mx-auto" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Failed to load dashboard data
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Unable to connect to the API. Please check your connection and try again.
          </p>
          <button 
            onClick={fetchStats}
            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200"
          >
            <Activity className="h-4 w-4 mr-2" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 opacity-10 rounded-2xl"></div>
        <div className="relative p-8 rounded-2xl backdrop-blur-sm">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Email Agent Dashboard
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">
            Real-time insights into your business outreach automation
          </p>
          <div className="flex items-center space-x-4 mt-4">
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span>System Online</span>
            </div>
            <div className="text-sm text-gray-500">
              Last updated: {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Companies Scraped"
          value={stats.scraping.total.toLocaleString()}
          change={`+${stats.scraping.today} today`}
          icon={<Database className="h-6 w-6" />}
          trend="up"
          gradient="from-blue-500 to-cyan-600"
        />
        <StatsCard
          title="Email Extraction Rate"
          value={`${stats.emails.extractionRate}%`}
          change={`${stats.emails.companiesWithEmails}/${stats.emails.totalCompanies} companies`}
          icon={<Mail className="h-6 w-6" />}
          trend="up"
          gradient="from-green-500 to-emerald-600"
        />
        <StatsCard
          title="Data Enrichment"
          value={`${stats.enrichment.enrichmentRate}%`}
          change={`${stats.enrichment.pending} pending`}
          icon={<TrendingUp className="h-6 w-6" />}
          trend="up"
          gradient="from-purple-500 to-pink-600"
        />
        <StatsCard
          title="Knowledge Base"
          value={stats.knowledgeBase.total.toString()}
          change={`+${stats.knowledgeBase.recentlyAdded} this week`}
          icon={<BarChart3 className="h-6 w-6" />}
          trend="up"
          gradient="from-orange-500 to-red-600"
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
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Cost Analysis
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400 font-medium">Total OpenAI Cost</span>
              <span className="font-bold text-green-600 dark:text-green-400">
                ${stats.enrichment.costTracker.totalCost.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400 font-medium">Tokens Used</span>
              <span className="font-semibold">{stats.enrichment.costTracker.totalTokensUsed.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <span className="text-gray-600 dark:text-gray-400 font-medium">API Requests</span>
              <span className="font-semibold">{stats.enrichment.costTracker.requestCount}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border-t">
              <span className="text-gray-700 dark:text-gray-300 font-medium">Avg Cost/Company</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">
                ${stats.enrichment.costTracker.requestCount > 0 
                  ? (stats.enrichment.costTracker.totalCost / stats.enrichment.costTracker.requestCount).toFixed(4)
                  : '0.0000'
                }
              </span>
            </div>
          </div>
        </div>

        {/* Knowledge Base Breakdown */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-500 to-pink-600 px-6 py-4">
            <h3 className="text-lg font-semibold text-white flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Knowledge Base
            </h3>
          </div>
          <div className="p-6 space-y-3">
            {Object.entries(stats.knowledgeBase.byType).map(([type, count]) => (
              <div key={type} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <span className="text-gray-600 dark:text-gray-400 font-medium capitalize">
                  {type.replace('_', ' ')}
                </span>
                <span className="font-bold text-purple-600 dark:text-purple-400">{count}</span>
              </div>
            ))}
            {Object.keys(stats.knowledgeBase.byType).length === 0 && (
              <div className="text-center py-8">
                <Database className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No documents found</p>
                <p className="text-gray-400 text-xs mt-1">Upload documents to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}