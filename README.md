# Sistema POS Offline-First com Sincronização Batch

Este projeto implementa um sistema de ponto de venda (POS) com suporte **offline-first** e sincronização batch automática. O sistema permite criar pedidos mesmo sem conexão com internet e sincroniza automaticamente quando a conexão é restaurada.

## 🚀 Funcionalidades

### Frontend (Next.js + IndexedDB)
- ✅ **Criação de pedidos offline** - Funciona sem conexão com internet
- ✅ **Fila de sincronização** - Gerenciamento inteligente de fila local com estados
- ✅ **Sincronização batch** - Envio em lote otimizado com retry automático
- ✅ **Dashboard de monitoramento** - Visualização em tempo real do status de sincronização
- ✅ **Deduplicação local** - Previne duplicação de pedidos por double-click
- ✅ **Tratamento robusto de falhas** - Retry com backoff exponencial e jitter

### Backend (NestJS + PostgreSQL)
- ✅ **API REST idempotente** - Processamento seguro com `externalId` único
- ✅ **Validação por item** - Cada item é validado individualmente sem afetar o batch
- ✅ **Upsert inteligente** - Detecta criação, atualização ou duplicação
- ✅ **Integração PostgreSQL** - Armazenamento persistente com índices otimizados

## 🏗️ Arquitetura

```
Frontend (Next.js)              Backend (NestJS)
┌─────────────────┐             ┌─────────────────┐
│  OrderForm      │             │  PosSyncController
│  OrderList      │◄────────────┤  PosSyncService
│  SyncDashboard  │             │  OrdersRepo
└─────────────────┘             └─────────────────┘
         │                               │
         ▼                               ▼
┌─────────────────┐             ┌─────────────────┐
│  IndexedDB      │             │  PostgreSQL
│  - orders       │             │  - orders table
│  - syncQueue    │             │  - external_id UNIQUE
│  - dedupe       │             └─────────────────┘
└─────────────────┘
```

## 📋 Fluxo de Trabalho

### 1. Criação de Pedido Offline
1. Usuário preenche formulário de pedido
2. Sistema gera `externalId` (UUID v4) no cliente
3. Pedido é salvo no IndexedDB com status `LOCAL_ONLY`
4. Evento de sincronização é criado na fila com status `PENDING`
5. Confirmação imediata é mostrada ao usuário

### 2. Sincronização Batch
1. Runner detecta conexão online ou intervalo (15s)
2. Coleta até 50 itens `PENDING` da fila local
3. Agrupa por endpoint e divide em chunks (máx. 256KB)
4. Envia batch para backend com compressão gzip opcional
5. Processa resposta item por item atualizando estados locais
6. Marca pedidos como `SYNCED` ou `ERROR` conforme resposta

### 3. Tratamento de Falhas
- **Erros de rede (5xx, 429, timeout)**: Agendam retry com backoff exponencial
- **Erros de autenticação (401/403)**: Pausam sincronização por 60 segundos
- **Erros de validação (400)**: Marcam item como `DEAD` sem retry
- **Após 10 tentativas**: Item é marcado como `DEAD` para revisão manual

## 🛠️ Instalação e Execução

### Pré-requisitos
- Node.js 18+
- Docker e Docker Compose
- PostgreSQL 16 (ou use Docker)

### Opção 1: Docker Compose (Recomendado)

```bash
# Clone o repositório
git clone <url-do-repositorio>
cd offline-first-sync-queue

# Inicie todos os serviços
docker-compose up -d

# Acesse a aplicação
Frontend: http://localhost:3000
Backend: http://localhost:3001
PostgreSQL: localhost:5432
```

### Opção 2: Desenvolvimento Local

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend (em outro terminal)
cd frontend/backend
npm install
npm run start:dev

# Configure PostgreSQL e crie o banco de dados
# Execute o script SQL em init.sql
```

## 📊 Testes

### Frontend Tests
```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom
npm run test
```

### Backend Tests
```bash
cd frontend/backend
npm run test
```

## 🔧 Configuração

### Variáveis de Ambiente

**Frontend:**
- `NEXT_PUBLIC_API_BASE_URL`: URL do backend (default: http://localhost:3001)

**Backend:**
- `DATABASE_URL`: String de conexão PostgreSQL
- `PORT`: Porta do servidor (default: 3001)
- `FRONTEND_URL`: URL do frontend para CORS

### Parâmetros de Sincronização

- **Batch size**: 50 itens por requisição
- **Max retries**: 10 tentativas
- **Retry backoff**: Exponencial com jitter (máx. 60s)
- **Payload limit**: 256KB por requisição
- **Sync interval**: 15 segundos
- **Stale timeout**: 60 segundos para itens `IN_FLIGHT`

## 📱 Uso

### Criar Pedido Offline
1. Acesse http://localhost:3000
2. Clique em "Novo Pedido"
3. Preencha os dados do cliente e itens
4. Clique em "Criar Pedido"
5. O pedido é salvo localmente imediatamente

### Monitorar Sincronização
1. Acesse http://localhost:3000/sync/status
2. Visualize estatísticas em tempo real
3. Monitore itens pendentes, em progresso e falhados
4. Veja detalhes de erros e retry counts

### Simular Offline
1. Desconecte da internet ou use ferramentas de desenvolvedor
2. Crie pedidos normalmente
3. Observe que eles ficam com status "Local"
4. Reconecte e veja a sincronização automática

## 🔒 Segurança

- **Idempotência**: Cada pedido tem `externalId` único gerado no cliente
- **Validação**: Backend valida cada item individualmente
- **CORS**: Configurado para aceitar apenas frontend autorizado
- **PostgreSQL**: Conexão segura com pool de conexões

## 📈 Performance

- **IndexedDB**: Armazenamento local rápido e confiável
- **Batch processing**: Reduz chamadas de rede
- **Compressão gzip**: Reduz tamanho dos payloads
- **Índices otimizados**: Queries rápidas no PostgreSQL
- **Jitter**: Evita thundering herd em reconexões

## 🚨 Limitações Conhecidas

- **Sem CRDT/merge**: Consistência eventual apenas
- **Conflitos de edição**: Não resolvidos automaticamente
- **Dedupe local**: Best-effort com janela curta (2s)
- **Single-tab**: Locking funciona apenas em uma aba
- **Sem Service Worker**: Background sync não implementado

## 🤝 Contribuindo

1. Faça fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🙏 Agradecimentos

- [Next.js](https://nextjs.org/) - Framework React
- [NestJS](https://nestjs.com/) - Framework Node.js
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) - API de banco de dados do navegador
- [PostgreSQL](https://www.postgresql.org/) - Banco de dados relacional
- [Tailwind CSS](https://tailwindcss.com/) - Framework CSS