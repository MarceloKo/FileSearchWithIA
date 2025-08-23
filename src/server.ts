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

        console.log(`Servidor está executando em http://${config.server.host}:${config.server.port}`);
        console.log(`Documentação da API disponível em http://${config.server.host}:${config.server.port}/docs`);
    } catch (err) {
        console.error("Falha ao iniciar servidor:", err);
        process.exit(1);
    }
};

start();