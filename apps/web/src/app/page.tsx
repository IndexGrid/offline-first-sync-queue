import { OrderForm } from '@/components/OrderForm'
import { OrderList } from '@/components/OrderList'

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Offline-First POS Dashboard
        </h1>
        <p className="text-gray-600">
          Point of sale system with offline-first synchronization
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Create New Order
          </h2>
          <OrderForm />
        </div>
        
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Recent Orders
          </h2>
          <OrderList />
        </div>
      </div>
    </div>
  )
}