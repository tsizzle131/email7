import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string
  change: string
  icon: React.ReactNode
  trend: 'up' | 'down' | 'neutral'
  gradient?: string
}

export function StatsCard({ title, value, change, icon, trend, gradient = 'from-blue-500 to-purple-600' }: StatsCardProps) {
  const trendConfig = {
    up: {
      color: 'text-green-600 dark:text-green-400',
      icon: <TrendingUp className="h-4 w-4 inline" />,
      bg: 'bg-green-50 dark:bg-green-900/20'
    },
    down: {
      color: 'text-red-600 dark:text-red-400', 
      icon: <TrendingDown className="h-4 w-4 inline" />,
      bg: 'bg-red-50 dark:bg-red-900/20'
    },
    neutral: {
      color: 'text-gray-600 dark:text-gray-400',
      icon: <Minus className="h-4 w-4 inline" />,
      bg: 'bg-gray-50 dark:bg-gray-800'
    }
  }[trend]

  return (
    <div className="group relative bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
      {/* Gradient background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-300`} />
      
      <div className="relative p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-lg`}>
              <div className="text-white">
                {icon}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {title}
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {value}
              </p>
            </div>
          </div>
        </div>
        
        <div className="mt-4">
          <div className={`inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium ${trendConfig.bg} ${trendConfig.color}`}>
            {trendConfig.icon}
            <span>{change}</span>
          </div>
        </div>
      </div>
    </div>
  )
}