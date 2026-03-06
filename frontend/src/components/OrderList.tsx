'use client';

import { useEffect, useState } from 'react';
import { getDB, OrderRecord } from '@/lib/db';

export function OrderList() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [filter, setFilter] = useState<'all' | 'LOCAL_ONLY' | 'SYNCED' | 'ERROR'>('all');
  const [isLoading, setIsLoading] = useState(true);

  const loadOrders = async () => {
    try {
      const db = await getDB();
      let orders: OrderRecord[];
      
      if (filter === 'all') {
        orders = await db.getAll('orders');
      } else {
        const index = db.transaction('orders').store.index('by-syncStatus');
        orders = await index.getAll(filter);
      }
      
      // Ordenar por updatedAt decrescente
      orders.sort((a, b) => b.updatedAt - a.updatedAt);
      setOrders(orders);
    } catch (error) {
      console.error('Erro ao carregar pedidos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    // Recarregar a cada 5 segundos para mostrar mudanças de status
    const interval = setInterval(loadOrders, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  const getStatusColor = (status: OrderRecord['syncStatus']) => {
    switch (status) {
      case 'LOCAL_ONLY': return 'bg-yellow-100 text-yellow-800';
      case 'SYNCED': return 'bg-green-100 text-green-800';
      case 'ERROR': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: OrderRecord['syncStatus']) => {
    switch (status) {
      case 'LOCAL_ONLY': return 'Local';
      case 'SYNCED': return 'Sincronizado';
      case 'ERROR': return 'Erro';
      default: return 'Desconhecido';
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
          <div className="h-24 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Lista de Pedidos</h2>
        
        <div className="flex gap-2 mb-4">
          {(['all', 'LOCAL_ONLY', 'SYNCED', 'ERROR'] as const).map((statusFilter) => (
            <button
              key={statusFilter}
              onClick={() => setFilter(statusFilter)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === statusFilter
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {statusFilter === 'all' ? 'Todos' : getStatusText(statusFilter)}
            </button>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">Nenhum pedido encontrado</p>
          <p className="text-gray-400 mt-2">Crie seu primeiro pedido para começar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.externalId} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Pedido #{order.externalId.slice(0, 8)}</h3>
                  <p className="text-sm text-gray-500">
                    {new Date(order.updatedAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.syncStatus)}`}>
                  {getStatusText(order.syncStatus)}
                </span>
              </div>

              <div className="border-t pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Cliente</p>
                    <p className="text-gray-600">
                      {(order.data as any)?.customer || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Total</p>
                    <p className="text-lg font-semibold text-gray-800">
                      R$ {(order.data as any)?.total?.toFixed(2) || '0.00'}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Itens</p>
                  <div className="space-y-2">
                    {((order.data as any)?.items || []).map((item: any, index: number) => (
                      <div key={index} className="flex justify-between items-center text-sm">
                        <span className="text-gray-600">
                          {item.qty}x {item.sku}
                        </span>
                        <span className="text-gray-800 font-medium">
                          R$ {(item.qty * item.price).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}