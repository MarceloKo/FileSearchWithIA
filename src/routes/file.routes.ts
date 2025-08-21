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
            description: 'Upload and process a file (PDF, Word, Excel, Text)',
            tags: ['files'],
            response: {
                200: uploadResponseSchema
            }
        },
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
            try {
                const data = await request.file();

                if (!data) {
                    return reply.code(400).send({ success: false, error: 'No file uploaded' });
                }

                const buffer = await data.toBuffer();
                const result = await fileService.processFile(
                    buffer,
                    data.filename,
                    data.mimetype
                );

                return reply.code(200).send({ success: true, data: result });
            } catch (error) {
                console.error('Error uploading file:', error);
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
                console.error('Error searching files:', error);
                return reply.code(500).send({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    });


}