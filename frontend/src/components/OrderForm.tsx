'use client';

import { useState } from 'react';
import { enqueueOrder } from '@/lib/sync/enqueue';

interface OrderItem {
  sku: string;
  qty: number;
  price: number;
}

export function OrderForm() {
  const [customer, setCustomer] = useState('');
  const [items, setItems] = useState<OrderItem[]>([{ sku: '', qty: 1, price: 0 }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  const addItem = () => {
    setItems([...items, { sku: '', qty: 1, price: 0 }]);
  };

  const updateItem = (index: number, field: keyof OrderItem, value: string | number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const total = items.reduce((sum, item) => sum + (item.qty * item.price), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer.trim() || items.some(item => !item.sku.trim() || item.qty <= 0 || item.price < 0)) {
      alert('Por favor, preencha todos os campos corretamente');
      return;
    }

    setIsSubmitting(true);
    try {
      const orderData = {
        customer: customer.trim(),
        items: items.map(item => ({
          sku: item.sku.trim(),
          qty: item.qty,
          price: item.price
        })),
        total,
        createdAt: new Date().toISOString()
      };

      const result = await enqueueOrder(orderData);
      setLastOrderId(result.externalId);
      
      // Reset form
      setCustomer('');
      setItems([{ sku: '', qty: 1, price: 0 }]);
      
      alert(`Pedido criado com sucesso! ID: ${result.externalId}`);
    } catch (error) {
      console.error('Erro ao criar pedido:', error);
      alert('Erro ao criar pedido. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Criar Novo Pedido</h2>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="customer" className="block text-sm font-medium text-gray-700 mb-2">
            Cliente
          </label>
          <input
            type="text"
            id="customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Nome do cliente"
            required
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-800">Itens do Pedido</h3>
            <button
              type="button"
              onClick={addItem}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Adicionar Item
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="flex gap-4 items-end p-4 border border-gray-200 rounded-md">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                  <input
                    type="text"
                    value={item.sku}
                    onChange={(e) => updateItem(index, 'sku', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Código do produto"
                    required
                  />
                </div>
                
                <div className="w-24">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => updateItem(index, 'qty', parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Preço Unit.</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={(e) => updateItem(index, 'price', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div className="w-24">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subtotal</label>
                  <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-right">
                    R$ {(item.qty * item.price).toFixed(2)}
                  </div>
                </div>
                
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-between items-center p-4 bg-gray-50 rounded-md">
          <div className="text-lg font-medium text-gray-800">
            Total: R$ {total.toFixed(2)}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-3 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Criando...' : 'Criar Pedido'}
          </button>
        </div>

        {lastOrderId && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-md">
            <p className="text-green-800">
              Último pedido criado com ID: <code className="bg-green-100 px-2 py-1 rounded">{lastOrderId}</code>
            </p>
          </div>
        )}
      </form>
    </div>
  );
}