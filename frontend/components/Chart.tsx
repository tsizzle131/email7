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
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-4">
        <h3 className="text-lg font-semibold text-white">
          Weekly Activity Trends
        </h3>
        <p className="text-blue-100 text-sm mt-1">
          Company scraping, email sending, and response tracking
        </p>
      </div>
      <div className="p-6">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <defs>
                <linearGradient id="companiesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="emailsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="responsesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="opacity-30" />
              <XAxis 
                dataKey="name" 
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                stroke="#6b7280"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'rgba(31, 41, 55, 0.95)',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Line 
                type="monotone" 
                dataKey="companies" 
                stroke="#3b82f6" 
                strokeWidth={3}
                fill="url(#companiesGradient)"
                name="Companies Scraped"
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
              />
              <Line 
                type="monotone" 
                dataKey="emails" 
                stroke="#10b981" 
                strokeWidth={3}
                fill="url(#emailsGradient)"
                name="Emails Sent"
                dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#10b981', strokeWidth: 2 }}
              />
              <Line 
                type="monotone" 
                dataKey="responses" 
                stroke="#f59e0b" 
                strokeWidth={3}
                fill="url(#responsesGradient)"
                name="Responses"
                dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#f59e0b', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="flex items-center justify-center space-x-6 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Companies</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Emails</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span className="text-sm text-gray-600 dark:text-gray-400">Responses</span>
          </div>
        </div>
      </div>
    </div>
  )
}