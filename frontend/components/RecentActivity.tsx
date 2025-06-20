'use client'

import { Activity, Mail, Database, TrendingUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const activities = [
  {
    id: 1,
    type: 'scraping',
    message: 'Scraped 15 new businesses from Google Maps',
    timestamp: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
    icon: Database
  },
  {
    id: 2,
    type: 'email',
    message: 'Campaign "Tech Startups NYC" sent 45 emails',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
    icon: Mail
  },
  {
    id: 3,
    type: 'enrichment',
    message: 'Enriched data for 8 companies',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4), // 4 hours ago
    icon: TrendingUp
  },
  {
    id: 4,
    type: 'response',
    message: 'Received response from Acme Corp',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6), // 6 hours ago
    icon: Activity
  },
  {
    id: 5,
    type: 'scraping',
    message: 'Email extraction completed for 12 websites',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
    icon: Database
  }
]

const typeColors = {
  scraping: 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-300',
  email: 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-300',
  enrichment: 'bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-300',
  response: 'bg-orange-100 text-orange-600 dark:bg-orange-900 dark:text-orange-300'
}

export function RecentActivity() {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
        Recent Activity
      </h3>
      <div className="flow-root">
        <ul className="-mb-8">
          {activities.map((activity, activityIdx) => (
            <li key={activity.id}>
              <div className="relative pb-8">
                {activityIdx !== activities.length - 1 ? (
                  <span
                    className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200 dark:bg-gray-600"
                    aria-hidden="true"
                  />
                ) : null}
                <div className="relative flex space-x-3">
                  <div>
                    <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white dark:ring-gray-800 ${typeColors[activity.type as keyof typeof typeColors]}`}>
                      <activity.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                    <div>
                      <p className="text-sm text-gray-900 dark:text-white">
                        {activity.message}
                      </p>
                    </div>
                    <div className="text-right text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(activity.timestamp, { addSuffix: true })}
                    </div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}