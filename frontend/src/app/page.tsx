import { OrderForm } from '@/components/OrderForm'
import { OrderList } from '@/components/OrderList'

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Dashboard POS Offline-First
        </h1>
        <p className="text-gray-600">
          Sistema de ponto de venda com sincronização offline-first
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Criar Novo Pedido
          </h2>
          <OrderForm />
        </div>
        
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Pedidos Recentes
          </h2>
          <OrderList />
        </div>
      </div>
    </div>
  )
}