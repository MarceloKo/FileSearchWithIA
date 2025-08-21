# Document Processing API with AI

API de processamento inteligente de documentos com busca semântica e chat AI integrado.

## 🚀 Funcionalidades

- **Processamento Multi-formato**: Suporte para PDF, Word, Excel, PowerPoint e imagens
- **OCR Integrado**: Extração de texto de imagens usando Tesseract.js (Português e Inglês)
- **Busca Semântica**: Pesquisa inteligente usando embeddings vetoriais
- **Chat com IA**: Interface de chat contextualizada com documentos indexados
- **Armazenamento Distribuído**: MinIO para arquivos e Qdrant para vetores
- **API RESTful**: Endpoints documentados com Swagger

## 🛠️ Stack Tecnológica

- **Framework**: Fastify (Node.js/TypeScript)
- **Banco Vetorial**: Qdrant Cloud
- **Armazenamento**: MinIO (S3-compatible)
- **IA/Embeddings**: OpenAI API
- **OCR**: Tesseract.js
- **Documentação**: Swagger/OpenAPI

## 📋 Pré-requisitos

- Node.js >= 18
- Conta no Qdrant Cloud
- Instância MinIO configurada
- Chave API da OpenAI

## 🔧 Instalação

1. Clone o repositório:

```bash
git clone <seu-repositorio>
cd QDRANT+IA
```

2. Instale as dependências:

```bash
npm install
```

3. Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

4. Edite o arquivo `.env` com suas credenciais:

```env
# Server
PORT=3000
HOST=0.0.0.0

# MinIO
MINIO_ENDPOINT=seu-endpoint.minio.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=sua-access-key
MINIO_SECRET_KEY=sua-secret-key
MINIO_BUCKET_NAME=documents

# Qdrant
QDRANT_URL=https://seu-cluster.qdrant.io
QDRANT_API_KEY=sua-api-key
QDRANT_COLLECTION_NAME=documents

# OpenAI
OPENAI_API_KEY=sua-api-key
OPENAI_MODEL=gpt-4
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Processing
CHUNK_SIZE=500
CHUNK_OVERLAP=50
```

## 🚀 Executando o Projeto

### Desenvolvimento

```bash
npm run dev
```

### Produção

```bash
npm run build
npm start
```

## 📚 API Endpoints

### Documentação Interativa

Acesse `http://localhost:3000/docs` para visualizar o Swagger UI.

```

## 🏗️ Arquitetura

### Pipeline de Processamento

```

Upload → Extração de Texto → Chunking → Embeddings → Armazenamento
↓ ↓ ↓ ↓ ↓
MinIO OCR/Parser Smart Split OpenAI Qdrant

```

### Estrutura de Diretórios

```

src/
├── config/ # Configurações centralizadas
├── routes/ # Definições de rotas da API
├── services/ # Lógica de negócio
│ ├── minio.service.ts
│ ├── qdrant.service.ts
│ ├── file-processing.service.ts
│ └── ai.service.ts
├── utils/ # Utilitários
│ ├── text-extraction.ts
│ ├── chunking.ts
│ └── embeddings.ts
├── app.ts # Configuração do Fastify
└── server.ts # Entry point

```

```
