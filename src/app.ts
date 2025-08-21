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
        console.log("Initializing services...");

        // Check MinIO
        const minioService = new MinioService();
        await minioService.initialize();

        // Check Qdrant
        const qdrantService = new QdrantService();
        await qdrantService.initialize();

        console.log("All services initialized successfully");
    } catch (error) {
        console.error("Service initialization failed:", error);
        app.log.error("Failed to initialize required services. Please check your configuration and ensure all services are running.");
        // We'll continue loading the app, but it might not function properly
    }

    // Register routes
    await app.register(fileRoutes);
    await app.register(aiRoutes);

    // Root route
    app.get('/', async (request, reply) => {
        return { status: 'ok', message: 'Document Processing API is running' };
    });

    return app;
}