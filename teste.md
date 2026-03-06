# Integração Beliv Parfum — Automatização de rastreios (VIP JT → Olist)

## Contexto atual (AS-IS)
Ecossistema do cliente:
- Loja: **Shopify**
- Checkout: **Yampi**
- ERP: **Olist (Tiny)** — pedidos, integrações e emissão de NF
- Transportadora: **JT Express**
- Sistema da transportadora: **VIP (JT)** — emissão de etiquetas, geração de rastreio e acompanhamento

Fluxo atual:
1. Pedido entra (Shopify + Yampi) e vai para o Olist.
2. No Olist é emitida a NF.
3. Operação entra manualmente no **VIP** e gera a etiqueta.
4. VIP gera o **código de rastreio**.
5. Operação copia/cola o rastreio manualmente para Yampi (hoje) para notificar o cliente.

Dor:
- alto tempo operacional + risco de erro humano.

## Objetivo (TO-BE)
Eliminar o “copiar e colar” do rastreio.
Como o VIP **não envia automaticamente** e a exportação é **baixada manualmente**, a solução mais simples e segura (sem depender de API privada da JT) é:

> **Baixou a planilha no VIP → faz upload em um sistema → o sistema atualiza rastreios no Olist automaticamente**  
> (e o Olist segue o fluxo de integração/notificação existente).

Preferência do cliente: **atualizar no Olist**.

---

## Restrições e decisões confirmadas
- Existe API no VIP, porém **privada** (dependente de liberação pela JT).
- Existe **exportação de planilha** no VIP com **1 linha por envio** contendo **NF** e **rastreio**.
- **Etiqueta é gerada manualmente** no VIP (sempre).
- **Número da NF não se repete** (é único no contexto do cliente).
- Destino do rastreio: **Olist** (preferência).

---

## Escopo da solução (MVP recomendado)

### 1) Importador de planilha (VIP → Sistema)
Criar um serviço web com:
- Tela/página de **upload** (drag-and-drop) da planilha exportada do VIP.
- Validação do arquivo (estrutura/colunas/tipos).
- Prévia do processamento:
  - quantas linhas lidas
  - quantas NF encontradas
  - quantos pedidos mapeados
  - quantas atualizações realizadas
  - erros (NF não encontrada, pedido não encontrado, rastreio vazio etc.)
- Execução do processamento com:
  - **idempotência** (reprocessar a mesma planilha não pode duplicar nem “sujar” dados)
  - logs/auditoria por linha

### 2) Conciliação NF → Pedido no Olist
Como a planilha contém **número da NF** e o cliente confirmou que ela é **única**, o match pode ser determinístico.

Estratégia recomendada:
1. Consultar NF no Olist por número (API Notas Fiscais - pesquisar)
2. Obter do retorno o `numeroEcommerce` (número do pedido no e-commerce/sistema)
3. Pesquisar pedido no Olist pelo `numeroEcommerce` para obter o `id` interno do pedido

Documentação relevante (Olist/Tiny API 2.0):
- **Pesquisar Notas Fiscais** (permite filtros; a doc lista `numeroEcommerce` como parâmetro e descreve os filtros de consulta) :contentReference[oaicite:0]{index=0}
- **Pesquisar Pedidos** (inclui parâmetro `numeroEcommerce`) :contentReference[oaicite:1]{index=1}
- **Obter Pedido** (para buscar detalhes, se necessário) :contentReference[oaicite:2]{index=2}

> Observação: na prática, dependendo do retorno do endpoint de pesquisa de NF, pode ser necessário chamar “Obter Nota Fiscal” para pegar campos complementares (caso o “pesquisar” retorne apenas um subset). :contentReference[oaicite:3]{index=3}

### 3) Atualização do rastreio no Olist
Com `id` do pedido em mãos, atualizar rastreio via API:

- Endpoint: **Atualizar informações de despacho (Pedido)**  
  Campos relevantes incluem `id` e `codigoRastreamento` (e opcionais como `urlRastreamento`, `transportadora`, `formaEnvio`) :contentReference[oaicite:4]{index=4}

---

## Arquitetura proposta

### Componentes
1) **Web App / Admin** (simples)
- Upload da planilha
- Visualização de resultados, erros e histórico de imports

2) **Backend (API + Worker)**
- Recebe arquivo, valida, cria um “job” de processamento
- Processa linhas em background (evita travar a UI em planilhas grandes)
- Integra com Olist API 2.0

3) **Banco de dados**
Tabelas sugeridas:
- `imports`
  - `id`, `filename`, `uploaded_at`, `status` (PENDING/RUNNING/DONE/FAILED), `stats_json`
- `import_rows`
  - `import_id`, `row_number`, `nf_number`, `tracking_code`, `status`, `error_message`
- `shipment_links` (idempotência/auditoria)
  - `nf_number` (unique), `olist_order_id`, `numero_ecommerce`, `tracking_code`, `updated_at`, `source_import_id`

### Idempotência (requisito obrigatório)
- Chave de idempotência mínima: **`nf_number`** (confirmado como único).
- Regra:
  - se `nf_number` já foi processada e o `tracking_code` é o mesmo → “skip”
  - se `nf_number` já existe e o `tracking_code` mudou → registrar como “alteração” e atualizar (com log)

### Observabilidade mínima
- Logs estruturados por import e por linha
- Métricas:
  - imports processados/dia
  - taxa de erro por causa (NF não encontrada, pedido não encontrado, falha API etc.)
- Relatório de erros exportável (CSV)

---

## Fluxo detalhado (step-by-step)

1) Operação gera etiqueta no VIP (manual).
2) VIP gera rastreio.
3) Operação exporta planilha por envio (manual).
4) Operação faz upload da planilha no sistema.
5) Sistema, para cada linha:
   5.1) Extrai `nf_number`, `tracking_code`  
   5.2) Consulta NF no Olist e obtém o `numeroEcommerce` (direto ou via “Obter NF”) :contentReference[oaicite:5]{index=5}  
   5.3) Pesquisa pedido no Olist por `numeroEcommerce` e obtém `id` do pedido :contentReference[oaicite:6]{index=6}  
   5.4) Atualiza despacho do pedido com `codigoRastreamento` :contentReference[oaicite:7]{index=7}  
   5.5) Persiste auditoria e resultado da linha
6) UI retorna o resumo e lista de falhas para correção.

---

## Erros esperados e tratamento

- **NF não encontrada no Olist**
  - marcar linha como FAILED + motivo
  - sugerir reprocessar após sincronização/geração de NF

- **Pedido não encontrado pelo `numeroEcommerce`**
  - marcar linha como FAILED
  - pode indicar inconsistência entre NF e pedido (ou `numeroEcommerce` ausente)
  - ação: checar no Olist se NF foi emitida sem vínculo correto

- **Rastreio vazio ou inválido**
  - marcar linha como FAILED
  - não atualizar Olist

- **Falha de API (timeout/429)**
  - retries com backoff e limite
  - job deve continuar e registrar falhas

---

## Segurança e compliance
- Token do Olist deve ficar em **secrets/env** (não hardcode).
- Restringir acesso ao painel por login/ACL (mínimo):
  - usuário operacional
  - usuário admin
- Guardar logs sem dados sensíveis desnecessários (evitar CPF etc. se não for requerido).

---

## O que fica fora do escopo (para evitar “escopo infinito”)
- Automatizar geração de etiqueta no VIP (hoje é manual).
- Remover necessidade de baixar planilha (só possível com:
  - liberação da **API privada** do VIP, ou
  - export automático (SFTP/EDI/email), ou
  - RPA — não recomendado por instabilidade).

---

## Extensões futuras (opcionais)
1) **API privada do VIP**
- Se a JT liberar credenciais, substituir upload manual por integração direta:
  - polling de eventos de etiqueta/rastreio
  - atualização near-real-time no Olist

2) **Webhook de rastreio (Olist)**
- Olist possui documentação de webhook para “envio de código de rastreio” (cenário útil se for o contrário: Olist → terceiros) :contentReference[oaicite:8]{index=8}

---

## Checklist de insumos necessários (para iniciar implementação)
- 1–3 exemplos reais de planilha exportada do VIP (pode mascarar dados sensíveis)
- Token/API key do Olist (Tiny) :contentReference[oaicite:9]{index=9}
- Confirmação do endpoint/fluxo no Olist que dispara notificação ao cliente após atualizar rastreio
- Ambiente de teste/homologação (ou pedido real de teste com NF e rastreio)

---

## Estimativa de complexidade (com cenário atual)
- **MVP upload + update Olist:** complexidade **média (~5/10)**  
- Principal risco removido: NF duplicada (cliente confirmou que não ocorre).
- Principal risco remanescente: inconsistências de dados (NF/pedido) e qualidade do export (colunas/formatos).