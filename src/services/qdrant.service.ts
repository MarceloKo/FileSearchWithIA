import { QdrantClient } from '@qdrant/js-client-rest';
import config from '../config';
import { TextChunk } from '../utils/chunking';
import { generateEmbedding } from '../utils/embeddings';
import { randomUUID } from 'crypto';

export interface SearchResult {
    id: string;
    payload: any;
    score: number;
}

export class QdrantService {
    private client: QdrantClient;

    constructor() {
        this.client = new QdrantClient({ url: config.qdrant.url, apiKey: config.qdrant.apiKey, https: true });
    }

    async initialize(): Promise<void> {
        try {
            // Verificar se a coleção existe
            const collections = await this.client.getCollections();
            const collectionExists = collections.collections.some(c => c.name === config.qdrant.collection);

            if (!collectionExists) {
                console.log(`Criando coleção '${config.qdrant.collection}'...`);

                // Obter um embedding de exemplo para determinar a dimensão correta
                console.log("Gerando embedding de teste para determinar a dimensão correta...");
                const sampleText = "Este é um texto de exemplo para determinar a dimensão do embedding.";
                const sampleEmbedding = await generateEmbedding(sampleText);
                const vectorSize = sampleEmbedding.length;

                console.log(`Dimensão do embedding detectada: ${vectorSize}`);

                // Criar coleção com a dimensão correta
                await this.client.createCollection(config.qdrant.collection, {
                    vectors: {
                        size: vectorSize, // Usar a dimensão real do embedding
                        distance: 'Cosine'
                    },
                    optimizers_config: {
                        default_segment_number: 2
                    },
                    replication_factor: 1
                });

                console.log(`Coleção '${config.qdrant.collection}' criada com sucesso com dimensão ${vectorSize}`);
            } else {
                // Se a coleção já existe, obter suas configurações
                const collectionInfo = await this.client.getCollection(config.qdrant.collection);
                console.log(`Coleção '${config.qdrant.collection}' já existe com dimensão ${collectionInfo.config?.params?.vectors?.size}`);
            }
        } catch (error) {
            console.error('Erro inicializando serviço Qdrant:', error);
            throw new Error('Falha ao inicializar serviço Qdrant');
        }
    }

    async upsertVectors(chunks: TextChunk[], fileUrl: string): Promise<void> {
        try {
            const points = await Promise.all(
                chunks.map(async (chunk, index) => {
                    const embedding = await generateEmbedding(chunk.text);
                    console.log(`Generated embedding for chunk ${index + 1}:`, embedding);
                    // Gerar um UUID válido para o ponto em vez de usar uma string com hífens
                    // Você precisará adicionar a biblioteca uuid: npm install uuid @types/uuid
                    const pointId = randomUUID();
                    return {
                        id: pointId,
                        vector: embedding,
                        payload: {
                            text: chunk.text,
                            metadata: {
                                ...chunk.metadata,
                                fileUrl
                            }
                        }
                    };
                })
            );
            console.log(`Enviando ${points.length} pontos para o Qdrant...`);
            console.log(`Tamanho do vetor do primeiro ponto: ${points[0].vector.length}`);

            // Batch upsert to Qdrant
            await this.client.upsert(config.qdrant.collection, {
                wait: true,
                points
            });

            console.log(`Successfully indexed ${points.length} chunks from file`);
        } catch (error) {
            console.error('Erro ao enviar vetores para o Qdrant:', error);

            // Adicionar detalhes extras para debugging
            if (error instanceof Error) {
                if ('data' in error && typeof error.data === 'object' && error.data !== null) {
                    console.error('Detalhes do erro:', error.data);
                }
            }

            throw new Error('Falha ao indexar documento no banco de dados vetorial');
        }
    }

    async searchSimilar(query: string, filter?: any, limit: number = 5): Promise<SearchResult[]> {
        try {
            // Generate embedding for query
            const queryEmbedding = await generateEmbedding(query);

            // Search Qdrant
            const searchParams: any = {
                vector: queryEmbedding,
                limit: limit,
                with_payload: true,
                with_vectors: false
            };

            // Add filter if provided
            if (filter) {
                searchParams.filter = filter;
            }

            const results = await this.client.search(config.qdrant.collection, searchParams);

            return results.map(result => ({
                id: String(result.id),
                payload: result.payload,
                score: result.score
            }));
        } catch (error) {
            console.error('Error searching Qdrant:', error);
            throw new Error('Failed to search vector database');
        }
    }
}