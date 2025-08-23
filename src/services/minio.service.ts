import { Client } from 'minio';
import config from '../config';

export class MinioService {
    private client: Client;

    constructor() {
        this.client = new Client({
            endPoint: config.minio.endPoint,
            // port: config.minio.port,
            useSSL: true,
            accessKey: config.minio.accessKey,
            secretKey: config.minio.secretKey,
        });
    }

    async initialize(): Promise<void> {
        try {
            console.log("Tentando conectar ao servidor MinIO...");

            // Check if bucket exists
            const bucketExists = await this.client.bucketExists(config.minio.bucketName);

            if (!bucketExists) {
                await this.client.makeBucket(config.minio.bucketName, 'us-east-1');
                console.log(`Bucket '${config.minio.bucketName}' criado com sucesso`);
            } else {
                console.log(`Bucket '${config.minio.bucketName}' já existe`);
            }
        } catch (error) {
            console.error("Erro de inicialização do MinIO:", error);
            console.warn("Serviço MinIO não conseguiu conectar ao servidor. Certifique-se de que o MinIO está em execução.");
            // You might want to decide if you want to throw or swallow the error based on your app requirements
            // For now, we'll rethrow to prevent the app from starting if MinIO isn't available
            throw new Error("Falha ao inicializar serviço MinIO. O servidor MinIO está em execução?");
        }
    }

    async uploadFile(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
        try {
            // Generate a unique object name with current timestamp
            const objectName = `${Date.now()}-${filename}`;

            await this.client.putObject(
                config.minio.bucketName,
                objectName,
                buffer,
                buffer.length,
                { 'Content-Type': mimeType }
            );

            // Return the URL to access the file
            return objectName;
        } catch (error) {
            console.error("Erro ao fazer upload do arquivo para MinIO:", error);
            throw new Error(`Falha ao fazer upload do arquivo para armazenamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
    }

    async getFileUrl(objectName: string): Promise<string> {
        try {
            return await this.client.presignedGetObject(config.minio.bucketName, objectName, 24 * 60 * 60); // 24 hours expiry
        } catch (error) {
            console.error("Erro ao gerar URL assinada:", error);
            throw new Error(`Falha ao gerar URL do arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
    }

    // src/services/minio.service.ts - adicione este método

    async getFile(objectName: string): Promise<Buffer> {
        try {
            // Cria um stream para ler o arquivo do MinIO
            const dataStream = await this.client.getObject(
                config.minio.bucketName,
                objectName
            );

            // Converte o stream em buffer
            return new Promise((resolve, reject) => {
                const chunks: Buffer[] = [];

                dataStream.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                dataStream.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });

                dataStream.on('error', (err) => {
                    reject(err);
                });
            });
        } catch (error) {
            console.error('Erro ao obter arquivo do MinIO:', error);
            throw new Error(`Falha ao recuperar arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
    }

    // Adicione também um método para obter os metadados do arquivo
    async getFileMetadata(objectName: string): Promise<any> {
        try {
            const stat = await this.client.statObject(
                config.minio.bucketName,
                objectName
            );

            return stat;
        } catch (error) {
            console.error('Erro ao obter metadados do arquivo do MinIO:', error);
            throw new Error(`Falha ao recuperar metadados do arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
    }
}