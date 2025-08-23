// src/server.ts
import { buildApp } from './app';
import config from './config';

const start = async () => {
    try {
        const app = await buildApp();

        await app.listen({
            port: config.server.port,
            host: '0.0.0.0'
        });

        console.log(`Server is running on http://${config.server.host}:${config.server.port}`);
        console.log(`API documentation available at http://${config.server.host}:${config.server.port}/docs`);
    } catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
};

start();