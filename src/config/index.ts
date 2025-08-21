import dotenv from 'dotenv';
dotenv.config();

export default {
    server: {
        port: parseInt(process.env.PORT || '3000'),
        host: process.env.HOST || 'localhost'
    },
    minio: {
        endPoint: process.env.MINIO_ENDPOINT || 'localhost',
        port: parseInt(process.env.MINIO_PORT || '9000'),
        accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
        secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
        bucketName: process.env.MINIO_BUCKET_NAME || 'documents'
    },
    qdrant: {
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        collection: process.env.QDRANT_COLLECTION || 'documents',
        apiKey: process.env.QDRANT_API_KEY || 'your-qdrant-api-key',
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-large',
        chatModel: process.env.CHAT_MODEL || 'gpt-4o'
    },
    chunking: {
        chunkSize: 500, // tokens per chunk
        chunkOverlap: 50 // overlap tokens between chunks
    }
};