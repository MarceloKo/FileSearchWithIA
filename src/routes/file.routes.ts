import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { FileProcessingService } from '../services/file-processing.service';
import { MultipartFile } from '@fastify/multipart';

// Change function signature to handle a done callback
export default async function fileRoutes(fastify: FastifyInstance, options: any) {
    const fileService = new FileProcessingService();

    // Make sure initialization happens before registering routes

    // Schema definitions...
    const uploadResponseSchema = {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            data: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        filename: { type: 'string' },
                        mimeType: { type: 'string' },
                        fileUrl: { type: 'string' },
                        extractedText: { type: 'string' },
                        chunks: { type: 'number' },
                        metadata: { type: 'object' }
                    }
                }
            },
            totalFiles: { type: 'number' },
            failedFiles: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        filename: { type: 'string' },
                        error: { type: 'string' }
                    }
                }
            }
        }
    };

    const searchResponseSchema = {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            results: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        payload: { type: 'object' },
                        score: { type: 'number' }
                    }
                }
            }
        }
    };

    // Register routes
    fastify.post('/api/files/upload', {
        schema: {
            description: 'Upload and process multiple files with optional metadata (path_file_external, idempotency)',
            tags: ['files'],
            response: {
                200: uploadResponseSchema
            }
        },
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const parts = request.parts();
                const processedFiles = [];
                const failedFiles = [];
                const MAX_FILES = 10;
                let fileCount = 0;
                let customMetadata: Record<string, unknown> = {};
                const fileParts: Array<{ buffer: Buffer; filename: string; mimetype: string }> = [];

                for await (const part of parts) {
                    if (part.type === 'field') {

                        if (part.fieldname === 'metadata') {
                            try {
                                customMetadata = { ...customMetadata, ...JSON.parse(part.value as string) };
                            } catch (e) {
                                console.error('Error parsing metadata JSON:', e);
                            }
                        } else if (part.fieldname === 'path_file_external') {
                            customMetadata.path_file_external = part.value;
                        } else if (part.fieldname === 'idempotency') {
                            customMetadata.idempotency = part.value;
                        } else {
                            // Aceitar outros campos como metadados adicionais
                            customMetadata[part.fieldname] = part.value;
                        }
                    } else if (part.type === 'file') {
                        fileCount++;

                        if (fileCount > MAX_FILES) {
                            failedFiles.push({
                                filename: part.filename,
                                error: `Número máximo de arquivos (${MAX_FILES}) excedido`
                            });
                            continue;
                        }

                        try {
                            const buffer = await part.toBuffer();
                            fileParts.push({
                                buffer,
                                filename: part.filename,
                                mimetype: part.mimetype
                            });
                        } catch (error) {
                            console.error(`Erro ao ler arquivo ${part.filename}:`, error);
                            failedFiles.push({
                                filename: part.filename,
                                error: error instanceof Error ? error.message : 'Erro desconhecido ao ler arquivo'
                            });
                        }
                    }
                }


                for (const filePart of fileParts) {
                    try {
                        const result = await fileService.processFile(
                            filePart.buffer,
                            filePart.filename,
                            filePart.mimetype,
                            customMetadata
                        );
                        processedFiles.push(result);
                    } catch (error) {
                        console.error(`Erro ao processar arquivo ${filePart.filename}:`, error);
                        failedFiles.push({
                            filename: filePart.filename,
                            error: error instanceof Error ? error.message : 'Erro desconhecido'
                        });
                    }
                }

                if (processedFiles.length === 0 && failedFiles.length === 0) {
                    return reply.code(400).send({
                        success: false,
                        error: 'Nenhum arquivo foi enviado'
                    });
                }

                return reply.code(200).send({
                    success: true,
                    data: processedFiles,
                    totalFiles: processedFiles.length + failedFiles.length,
                    failedFiles: failedFiles
                });
            } catch (error) {
                console.error('Erro ao fazer upload de arquivos:', error);
                return reply.code(500).send({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    });

    fastify.get('/api/files/search', {
        schema: {
            description: 'Search for files based on content',
            tags: ['files'],
            querystring: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    limit: { type: 'number', default: 5 }
                },
                required: ['query']
            },
            response: {
                200: searchResponseSchema
            }
        },
        handler: async (request: FastifyRequest<{
            Querystring: { query: string; limit?: number }
        }>, reply: FastifyReply) => {
            try {
                const { query, limit = 5 } = request.query;
                const results = await fileService.searchFiles(query);

                return reply.code(200).send({ success: true, results });
            } catch (error) {
                console.error('Erro ao buscar arquivos:', error);
                return reply.code(500).send({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    });

    fastify.get('/api/files/hybrid-search', {
        schema: {
            description: 'Hybrid search (dense + sparse vectors) for files based on content',
            tags: ['files'],
            querystring: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    limit: { type: 'number', default: 5 },
                    alpha: { type: 'number', default: 0.5, minimum: 0, maximum: 1 }
                },
                required: ['query']
            },
            response: {
                200: searchResponseSchema
            }
        },
        handler: async (request: FastifyRequest<{
            Querystring: { query: string; limit?: number; alpha?: number }
        }>, reply: FastifyReply) => {
            try {
                const { query, limit = 5, alpha = 0.5 } = request.query;
                const results = await fileService.hybridSearchFiles(query, undefined, limit, alpha);

                return reply.code(200).send({ success: true, results });
            } catch (error) {
                console.error('Erro ao executar busca híbrida:', error);
                return reply.code(500).send({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    });


}