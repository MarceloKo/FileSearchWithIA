import { extractTextFromBuffer, ExtractedText } from '../utils/text-extraction';
import { chunkText, TextChunk } from '../utils/chunking';
import { SmartChunker, SmartChunk } from '../utils/smart-chunking';
import { MinioService } from './minio.service';
import { QdrantService, SearchResult } from './qdrant.service';
import { sparseVectorService } from './sparse-vector.service';
import config from '../config';

export interface ProcessedFile {
    filename: string;
    mimeType: string;
    fileUrl: string;
    extractedText: string;
    chunks: number;
    metadata: Record<string, unknown>;
}

export interface CustomMetadata {
    path_file_external?: string;
    idempotency?: string;
    [key: string]: unknown;
}

export class FileProcessingService {
    private minioService: MinioService;
    private qdrantService: QdrantService;

    constructor() {
        this.minioService = new MinioService();
        this.qdrantService = new QdrantService();

        this.initialize();

    }

    async initialize(): Promise<void> {
        await this.minioService.initialize();
        await this.qdrantService.initialize();
    }

    async processFile(buffer: Buffer, filename: string, mimeType: string, customMetadata?: CustomMetadata): Promise<ProcessedFile> {
        try {

            // ACCEPT text files only .TXT OR .MD
            if (mimeType !== 'text/plain' && mimeType !== 'text/markdown') {
                throw new Error('Apenas arquivos de texto são suportados');
            }

            // 1. Extract text from the file
            const extractedData: ExtractedText = await extractTextFromBuffer(buffer, filename, mimeType);

            // 2. Upload the original file to MinIO
            const fileUrl = await this.minioService.uploadFile(buffer, filename, mimeType);

            // 3. Chunk the text
            console.log(`Chunking text...`, new Date().toISOString());
            const chunks: TextChunk[] = chunkText(
                extractedData,
                config.chunking.chunkSize,
                config.chunking.chunkOverlap
            );

            // 4. Add document to sparse vector vocabulary
            console.log(`Adding document to sparse vector vocabulary...`, new Date().toISOString());
            chunks.forEach(chunk => {
                sparseVectorService.addDocument(chunk.text);
            });

            console.log(`Upserting vectors to Qdrant...`, new Date().toISOString());

            // Processar metadados para busca por pasta
            const enhancedMetadata = this.enhanceMetadataForFolderSearch(customMetadata);
            await this.qdrantService.upsertVectors(chunks, fileUrl, enhancedMetadata);

            // 6. Return the processing result
            return {
                filename,
                mimeType,
                fileUrl,
                extractedText: extractedData.text.substring(0, 200) + '...', // Preview only
                chunks: chunks.length,
                metadata: { ...extractedData.metadata, ...customMetadata }
            };
        } catch (error) {
            console.error('Erro ao processar arquivo:', error);
            throw new Error(`Falha ao processar arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
        }
    }

    async searchFiles(query: string, filters?: any): Promise<SearchResult[]> {
        return await this.qdrantService.searchSimilar(query, filters);
    }

    async hybridSearchFiles(query: string, filters?: any, limit: number = 5, alpha: number = 0.5): Promise<SearchResult[]> {
        return await this.qdrantService.hybridSearch(query, filters, limit, alpha);
    }

    private enhanceMetadataForFolderSearch(customMetadata?: CustomMetadata): CustomMetadata {
        if (!customMetadata?.path_file_external) {
            return customMetadata || {};
        }

        const path = customMetadata.path_file_external as string;
        const enhancedMetadata = { ...customMetadata };

        // Extrair todas as pastas do caminho para permitir busca hierárquica
        const pathParts = path.split('/').filter(part => part.length > 0);
        const folders: string[] = [];

        // Criar lista de todas as pastas possíveis
        let currentPath = '';
        for (const part of pathParts.slice(0, -1)) { // Excluir o nome do arquivo
            currentPath += '/' + part;
            folders.push(currentPath);
        }

        // Adicionar metadados de pasta para facilitar a busca
        enhancedMetadata.folder_paths = folders;

        return enhancedMetadata;
    }
}