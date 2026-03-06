import { SyncDashboard } from '@/components/SyncDashboard'

export default function SyncStatusPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Status de Sincronização
        </h1>
        <p className="text-gray-600">
          Monitoramento em tempo real da fila de sincronização e estatísticas
        </p>
      </div>
      
      <SyncDashboard />
    </div>
  )
}