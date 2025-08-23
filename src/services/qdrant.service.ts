import { QdrantClient } from '@qdrant/js-client-rest';
import config from '../config';
import { TextChunk } from '../utils/chunking';
import { generateEmbedding } from '../utils/embeddings';
import { randomUUID } from 'crypto';
import { sparseVectorService, SparseVector } from './sparse-vector.service';

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

                // Criar coleção com vetores nomeados para busca híbrida
                await this.client.createCollection(config.qdrant.collection, {
                    vectors: {
                        dense: {
                            size: vectorSize,
                            distance: 'Cosine'
                        }
                    },
                    sparse_vectors: {
                        sparse: {
                            index: {
                                on_disk: false
                            }
                        }
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

    async upsertVectors(chunks: TextChunk[], fileUrl: string, customMetadata?: any): Promise<void> {
        try {
            console.log(`Enviando chunks ${chunks.length} para embedding.. ${new Date().toISOString()}`);
            const points = await Promise.all(
                chunks.map(async (chunk: TextChunk, index: number) => {
                    const denseEmbedding = await generateEmbedding(chunk.text);
                    const sparseVector = sparseVectorService.createSparseVector(chunk.text);

                    // console.log(`Generated embeddings for chunk ${index + 1}`);
                    const pointId = randomUUID();

                    return {
                        id: pointId,
                        vector: {
                            dense: denseEmbedding,
                            sparse: {
                                indices: sparseVector.indices,
                                values: sparseVector.values
                            }
                        },
                        payload: {
                            text: chunk.text,
                            metadata: {
                                ...chunk.metadata,
                                fileUrl,
                                ...customMetadata
                            }
                        }
                    };
                })
            );
            console.log(`Enviando ${points.length} pontos para o Qdrant... ${new Date().toISOString()}`);
            console.log(`Tamanho do vetor denso do primeiro ponto: ${points[0].vector.dense.length}`);

            // Batch upsert to Qdrant
            await this.client.upsert(config.qdrant.collection, {
                wait: true,
                points: points
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
            const queryEmbedding = await generateEmbedding(query);

            const searchParams: any = {
                vector: {
                    name: 'dense',
                    vector: queryEmbedding
                },
                limit: limit,
                with_payload: true,
                with_vectors: false
            };

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

    async hybridSearch(query: string, filter?: any, limit: number = 5, alpha: number = 0.5): Promise<SearchResult[]> {
        try {
            const [denseEmbedding, sparseVector] = await Promise.all([
                generateEmbedding(query),
                Promise.resolve(sparseVectorService.createQueryVector(query))
            ]);

            const denseSearchParams: any = {
                vector: {
                    name: 'dense',
                    vector: denseEmbedding
                },
                limit: limit * 2,
                with_payload: true,
                with_vectors: false
            };

            const sparseSearchParams: any = {
                vector: {
                    name: 'sparse',
                    vector: {
                        indices: sparseVector.indices,
                        values: sparseVector.values
                    }
                },
                limit: limit * 2,
                with_payload: true,
                with_vectors: false
            };

            if (filter) {
                denseSearchParams.filter = filter;
                sparseSearchParams.filter = filter;
            }

            const [denseResults, sparseResults] = await Promise.all([
                this.client.search(config.qdrant.collection, denseSearchParams),
                this.client.search(config.qdrant.collection, sparseSearchParams)
            ]);

            const scoreMap = new Map<string, { payload: any, denseScore: number, sparseScore: number }>();

            for (const result of denseResults) {
                const id = String(result.id);
                scoreMap.set(id, {
                    payload: result.payload,
                    denseScore: result.score,
                    sparseScore: 0
                });
            }

            for (const result of sparseResults) {
                const id = String(result.id);
                const existing = scoreMap.get(id);
                if (existing) {
                    existing.sparseScore = result.score;
                } else {
                    scoreMap.set(id, {
                        payload: result.payload,
                        denseScore: 0,
                        sparseScore: result.score
                    });
                }
            }

            const hybridResults: SearchResult[] = [];
            for (const [id, data] of scoreMap) {
                const hybridScore = alpha * data.denseScore + (1 - alpha) * data.sparseScore;
                hybridResults.push({
                    id,
                    payload: data.payload,
                    score: hybridScore
                });
            }

            hybridResults.sort((a, b) => b.score - a.score);

            return hybridResults.slice(0, limit);
        } catch (error) {
            console.error('Error performing hybrid search:', error);
            throw new Error('Failed to perform hybrid search');
        }
    }
}