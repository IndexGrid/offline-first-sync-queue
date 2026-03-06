import { SyncDashboard } from '@/components/SyncDashboard'

export default function SyncStatusPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Sync Status
        </h1>
        <p className="text-gray-600">
          Real-time monitoring of sync queue and statistics
        </p>
      </div>
      
      <SyncDashboard />
    </div>
  )
}