import { OrderForm } from '@/components/OrderForm'

export default function NewOrderPage() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Create New Order
        </h1>
        <p className="text-gray-600">
          Fill in the order details. It will be saved locally and synchronized when there is a connection.
        </p>
      </div>
      
      <OrderForm />
    </div>
  )
}