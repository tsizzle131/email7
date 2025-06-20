'use client'

import { useState } from 'react'
import { apiClient } from '@/lib/api'
import { Database, Globe, Mail, Play, RefreshCw } from 'lucide-react'

export default function DataCollection() {
  const [scrapingConfig, setScrapingConfig] = useState({
    location: '',
    business_type: '',
    max_results: 50,
    exclude_chains: true
  })
  const [loading, setLoading] = useState({
    scraping: false,
    emails: false
  })
  const [results, setResults] = useState<any>(null)

  const handleScrapeBusinesses = async () => {
    if (!scrapingConfig.location) {
      alert('Please enter a location')
      return
    }

    setLoading({ ...loading, scraping: true })
    try {
      const response = await apiClient.post('/api/scrape/businesses', scrapingConfig)
      setResults(response.data)
      alert(`Successfully scraped ${response.data.count} businesses`)
    } catch (error) {
      alert('Error scraping businesses')
    } finally {
      setLoading({ ...loading, scraping: false })
    }
  }

  const handleExtractEmails = async () => {
    setLoading({ ...loading, emails: true })
    try {
      const response = await apiClient.post('/api/scrape/emails')
      setResults(response.data)
      alert('Email extraction completed')
    } catch (error) {
      alert('Error extracting emails')
    } finally {
      setLoading({ ...loading, emails: false })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Data Collection</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Scrape businesses from Google Maps and extract email addresses
        </p>
      </div>

      {/* Business Scraping */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center mb-4">
          <Database className="h-6 w-6 text-primary-500 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Business Scraping
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Location *
            </label>
            <input
              type="text"
              value={scrapingConfig.location}
              onChange={(e) => setScrapingConfig({ ...scrapingConfig, location: e.target.value })}
              placeholder="e.g., New York, NY"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Business Type
            </label>
            <input
              type="text"
              value={scrapingConfig.business_type}
              onChange={(e) => setScrapingConfig({ ...scrapingConfig, business_type: e.target.value })}
              placeholder="e.g., restaurants, tech companies"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Max Results
            </label>
            <input
              type="number"
              value={scrapingConfig.max_results}
              onChange={(e) => setScrapingConfig({ ...scrapingConfig, max_results: parseInt(e.target.value) })}
              min="1"
              max="200"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="exclude_chains"
              checked={scrapingConfig.exclude_chains}
              onChange={(e) => setScrapingConfig({ ...scrapingConfig, exclude_chains: e.target.checked })}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="exclude_chains" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
              Exclude chain businesses
            </label>
          </div>
        </div>

        <button
          onClick={handleScrapeBusinesses}
          disabled={loading.scraping || !scrapingConfig.location}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
        >
          {loading.scraping ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          {loading.scraping ? 'Scraping...' : 'Start Scraping'}
        </button>
      </div>

      {/* Email Extraction */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center mb-4">
          <Mail className="h-6 w-6 text-primary-500 mr-2" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Email Extraction
          </h2>
        </div>

        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Extract email addresses from the websites of scraped businesses.
        </p>

        <button
          onClick={handleExtractEmails}
          disabled={loading.emails}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
        >
          {loading.emails ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Globe className="h-4 w-4 mr-2" />
          )}
          {loading.emails ? 'Extracting...' : 'Extract Emails'}
        </button>
      </div>

      {/* Results */}
      {results && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Results
          </h3>
          <pre className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md overflow-auto text-sm">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}