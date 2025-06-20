'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// Mock data - in a real app, this would come from your API
const data = [
  { name: 'Mon', companies: 12, emails: 8, responses: 2 },
  { name: 'Tue', companies: 19, emails: 15, responses: 4 },
  { name: 'Wed', companies: 15, emails: 12, responses: 3 },
  { name: 'Thu', companies: 25, emails: 20, responses: 6 },
  { name: 'Fri', companies: 22, emails: 18, responses: 5 },
  { name: 'Sat', companies: 8, emails: 6, responses: 1 },
  { name: 'Sun', companies: 5, emails: 4, responses: 1 },
]

export function Chart() {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
        Weekly Activity
      </h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="name" 
              className="text-gray-600 dark:text-gray-400"
            />
            <YAxis className="text-gray-600 dark:text-gray-400" />
            <Tooltip 
              contentStyle={{
                backgroundColor: 'rgb(31 41 55)',
                border: 'none',
                borderRadius: '8px',
                color: 'white'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="companies" 
              stroke="#3b82f6" 
              strokeWidth={2}
              name="Companies Scraped"
            />
            <Line 
              type="monotone" 
              dataKey="emails" 
              stroke="#10b981" 
              strokeWidth={2}
              name="Emails Sent"
            />
            <Line 
              type="monotone" 
              dataKey="responses" 
              stroke="#f59e0b" 
              strokeWidth={2}
              name="Responses"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}