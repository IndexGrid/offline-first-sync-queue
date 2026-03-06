import { OrderList } from '@/components/OrderList'

export default function OrdersPage() {
  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Todos os Pedidos
        </h1>
        <p className="text-gray-600">
          Visualize e gerencie todos os pedidos do sistema
        </p>
      </div>
      
      <OrderList />
    </div>
  )
}