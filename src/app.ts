// src/app.ts
import Fastify, { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyCors from '@fastify/cors';
import fileRoutes from './routes/file.routes';
import aiRoutes from './routes/ai.routes';
import config from './config';
import { MinioService } from './services/minio.service';
import { QdrantService } from './services/qdrant.service';

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({
        logger: true
    });

    // Register plugins
    app.register(fastifyCors, {
        origin: '*' // In production, this should be restricted
    });

    app.register(fastifyMultipart, {
        limits: {
            fileSize: 50 * 1024 * 1024 // 50MB limit
        }
    });

    // Register Swagger
    app.register(fastifySwagger, {
        swagger: {
            info: {
                title: 'Document Processing API with Qdrant & MinIO',
                description: 'API for processing documents, storing them in MinIO, and indexing in Qdrant',
                version: '1.0.0'
            },
            host: `${config.server.host}:${config.server.port}`,
            schemes: ['http'],
            consumes: ['application/json', 'multipart/form-data'],
            produces: ['application/json'],
            tags: [
                { name: 'files', description: 'File processing endpoints' },
                { name: 'ai', description: 'AI chat endpoints' }
            ]
        }
    });

    app.register(fastifySwaggerUi, {
        routePrefix: '/docs',
        logLevel: 'silent',
    });

    // Check if required services are running before starting the app
    try {
        console.log("Inicializando serviços...");

        // Check MinIO
        const minioService = new MinioService();
        await minioService.initialize();

        // Check Qdrant
        const qdrantService = new QdrantService();
        await qdrantService.initialize();

        console.log("Todos os serviços inicializados com sucesso");
    } catch (error) {
        console.error("Falha na inicialização dos serviços:", error);
        app.log.error("Falha ao inicializar serviços necessários. Verifique sua configuração e certifique-se de que todos os serviços estão em execução.");
        // We'll continue loading the app, but it might not function properly
    }

    // Register routes
    await app.register(fileRoutes);
    await app.register(aiRoutes);

    // Root route
    app.get('/', async (request, reply) => {
        return { status: 'ok', message: 'API de Processamento de Documentos está executando' };
    });

    return app;
}