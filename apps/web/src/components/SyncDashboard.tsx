'use client';

import { useEffect, useState } from 'react';
import { getDB, SyncQueueItem } from '@/lib/db';

export function SyncDashboard() {
  const [syncItems, setSyncItems] = useState<SyncQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  const loadSyncItems = async () => {
    try {
      const db = await getDB();
      const items = await db.getAll('syncQueue');
      
      // Ordenar por createdAt decrescente
      items.sort((a, b) => b.createdAt - a.createdAt);
      setSyncItems(items);
    } catch (error) {
      console.error('Error loading queue items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);

    loadSyncItems();
    const interval = setInterval(loadSyncItems, 3000);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const getStatusColor = (status: SyncQueueItem['status']) => {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'IN_FLIGHT': return 'bg-blue-100 text-blue-800';
      case 'SYNCED': return 'bg-green-100 text-green-800';
      case 'RETRYABLE_ERROR': return 'bg-orange-100 text-orange-800';
      case 'FATAL_ERROR': return 'bg-red-200 text-red-900';
      case 'DEAD_LETTER': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: SyncQueueItem['status']) => {
    switch (status) {
      case 'PENDING': return 'Pending';
      case 'IN_FLIGHT': return 'In Flight';
      case 'SYNCED': return 'Synced';
      case 'RETRYABLE_ERROR': return 'Retrying';
      case 'FATAL_ERROR': return 'Fatal Error';
      case 'DEAD_LETTER': return 'Dead Letter';
      default: return 'Unknown';
    }
  };

  const stats = {
    total: syncItems.length,
    pending: syncItems.filter(item => item.status === 'PENDING').length,
    inFlight: syncItems.filter(item => item.status === 'IN_FLIGHT').length,
    synced: syncItems.filter(item => item.status === 'SYNCED').length,
    error: syncItems.filter(item => item.status === 'RETRYABLE_ERROR' || item.status === 'FATAL_ERROR' || item.status === 'DEAD_LETTER').length,
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">Sync Dashboard</h2>
        
        <div className="flex items-center gap-4 mb-6">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${
            isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            <div className={`w-3 h-3 rounded-full ${
              isOnline ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className="font-medium">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          
          <button
            onClick={loadSyncItems}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
          <div className="text-sm text-gray-600">Total</div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          <div className="text-sm text-gray-600">Pending</div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="text-2xl font-bold text-blue-600">{stats.inFlight}</div>
          <div className="text-sm text-gray-600">In Flight</div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="text-2xl font-bold text-green-600">{stats.synced}</div>
          <div className="text-sm text-gray-600">Synced</div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="text-2xl font-bold text-red-600">{stats.error}</div>
          <div className="text-sm text-gray-600">Errors</div>
        </div>
      </div>

      {/* Lista de Itens */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Sync Queue</h3>
        </div>
        
        {syncItems.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-gray-500 text-lg">No items in sync queue</p>
            <p className="text-gray-400 mt-2">Create orders to see items appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {syncItems.map((item) => (
              <div key={item.id} className="p-6 hover:bg-gray-50">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(item.status)}`}>
                        {getStatusText(item.status)}
                      </span>
                      <span className="text-sm text-gray-500">
                        {item.entityType} - {item.externalId.slice(0, 8)}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-600">
                      <p>Created: {new Date(item.createdAt).toLocaleString()}</p>
                      {item.nextAttemptAt < Number.MAX_SAFE_INTEGER && (
                        <p>Next attempt: {new Date(item.nextAttemptAt).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="text-sm text-gray-500 mb-1">
                      Attempts: {item.retryCount}/10
                    </div>
                  </div>
                </div>
                
                {item.lastError && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-700">
                      <strong>Error:</strong> {item.lastError}
                    </p>
                  </div>
                )}
                
                {item.status === 'IN_FLIGHT' && (
                  <div className="mt-3">
                    <div className="flex items-center gap-2 text-blue-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      <span className="text-sm font-medium">Sending...</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}