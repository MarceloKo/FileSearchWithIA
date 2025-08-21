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
            console.log("Attempting to connect to MinIO server...");

            // Check if bucket exists
            const bucketExists = await this.client.bucketExists(config.minio.bucketName);

            if (!bucketExists) {
                await this.client.makeBucket(config.minio.bucketName, 'us-east-1');
                console.log(`Bucket '${config.minio.bucketName}' created successfully`);
            } else {
                console.log(`Bucket '${config.minio.bucketName}' already exists`);
            }
        } catch (error) {
            console.error("MinIO initialization error:", error);
            console.warn("MinIO service could not connect to the server. Please ensure MinIO is running.");
            // You might want to decide if you want to throw or swallow the error based on your app requirements
            // For now, we'll rethrow to prevent the app from starting if MinIO isn't available
            throw new Error("Failed to initialize MinIO service. Is the MinIO server running?");
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
            console.error("Error uploading file to MinIO:", error);
            throw new Error(`Failed to upload file to storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getFileUrl(objectName: string): Promise<string> {
        try {
            return await this.client.presignedGetObject(config.minio.bucketName, objectName, 24 * 60 * 60); // 24 hours expiry
        } catch (error) {
            console.error("Error generating presigned URL:", error);
            throw new Error(`Failed to generate file URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            console.error('Error getting file from MinIO:', error);
            throw new Error(`Failed to retrieve file: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            console.error('Error getting file metadata from MinIO:', error);
            throw new Error(`Failed to retrieve file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}