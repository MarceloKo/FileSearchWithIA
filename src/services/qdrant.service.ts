import { QdrantClient } from '@qdrant/js-client-rest';
import config from '../config';
import { TextChunk } from '../utils/chunking';
import { generateEmbedding, generateBatchEmbeddings } from '../utils/embeddings';
import { randomUUID } from 'crypto';
import { sparseVectorService, SparseVector } from './sparse-vector.service';

export interface SearchResult {
    id: string;
    payload: any;
    score: number;
}

interface QdrantPoint {
    id: string;
    vector: {
        dense: number[];
        sparse: {
            indices: number[];
            values: number[];
        };
    };
    payload: {
        text: string;
        metadata: Record<string, unknown>;
    };
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

    private async processBatch(
        chunkBatch: TextChunk[],
        batchNum: number,
        totalBatches: number,
        fileUrl: string,
        customMetadata?: Record<string, unknown>
    ): Promise<QdrantPoint[]> {
        console.log(`📦 Processando lote ${batchNum}/${totalBatches} (${chunkBatch.length} chunks)...`);

        const texts = chunkBatch.map(chunk => chunk.text);
        const denseEmbeddings = await generateBatchEmbeddings(texts);

        const batchPoints: QdrantPoint[] = chunkBatch.map((chunk: TextChunk, index: number) => {
            const sparseVector = sparseVectorService.createSparseVector(chunk.text);
            const pointId = randomUUID();

            return {
                id: pointId,
                vector: {
                    dense: denseEmbeddings[index],
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
        });

        console.log(`✅ Lote ${batchNum} processado com sucesso`);
        return batchPoints;
    }

    private createBatches<T>(array: T[], batchSize: number): T[][] {
        const batches: T[][] = [];
        for (let i = 0; i < array.length; i += batchSize) {
            batches.push(array.slice(i, i + batchSize));
        }
        return batches;
    }

    async upsertVectors(chunks: TextChunk[], fileUrl: string, customMetadata?: Record<string, unknown>): Promise<void> {
        try {
            console.log(`🚀 Processando ${chunks.length} chunks em lotes para embedding... ${new Date().toISOString()}`);

            const OPENAI_BATCH_SIZE = 250;
            const batches = this.createBatches(chunks, OPENAI_BATCH_SIZE);
            const totalBatches = batches.length;

            const batchPromises = batches.map((batch, index) =>
                this.processBatch(batch, index + 1, totalBatches, fileUrl, customMetadata)
            );

            const batchResults = await Promise.all(batchPromises);
            const allPoints: QdrantPoint[] = batchResults.flat();

            console.log(`🎯 Enviando ${allPoints.length} pontos para o Qdrant... ${new Date().toISOString()}`);
            console.log(`📏 Tamanho do vetor denso: ${allPoints[0].vector.dense.length} dimensões`);

            await this.client.upsert(config.qdrant.collection, {
                wait: true,
                points: allPoints
            });

            console.log(`🎉 Successfully indexed ${allPoints.length} chunks from file`);
        } catch (error) {
            console.error('❌ Erro ao enviar vetores para o Qdrant:', error);

            if (error instanceof Error) {
                if ('data' in error && typeof error.data === 'object' && error.data !== null) {
                    console.error('📋 Detalhes do erro:', error.data);
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