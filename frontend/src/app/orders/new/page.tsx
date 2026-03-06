import { OrderForm } from '@/components/OrderForm'

export default function NewOrderPage() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Criar Novo Pedido
        </h1>
        <p className="text-gray-600">
          Preencha os dados do pedido. Ele será salvo localmente e sincronizado quando houver conexão.
        </p>
      </div>
      
      <OrderForm />
    </div>
  )
}