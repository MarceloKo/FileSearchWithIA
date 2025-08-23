import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AIService } from '../services/ai.service';

// Change function signature to handle options parameter
export default async function aiRoutes(fastify: FastifyInstance, options: any) {
    const aiService = new AIService();

    // Schema for chat response
    const chatResponseSchema = {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            answer: { type: 'string' },
            sources: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        filename: { type: 'string' },
                        fileUrl: { type: 'string' },
                        relevance: { type: 'number' },
                        excerpt: { type: 'string' }
                    }
                }
            }
        }
    };

    // Chat with AI endpoint
    fastify.post('/api/ai/chat', {
        schema: {
            description: 'Chat with AI about your documents with optional path filtering',
            tags: ['ai'],
            body: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    useHybridSearch: { type: 'boolean', default: true },
                    alpha: { type: 'number', default: 0.5, minimum: 0, maximum: 1 },
                    pathFileExternal: { type: 'string', description: 'Filter results by external file path' },
                    stream: { type: 'boolean', default: false, description: 'Enable streaming response' }
                },
                required: ['query']
            },
            response: {
                200: chatResponseSchema
            }
        },
        handler: async (request: FastifyRequest<{
            Body: { query: string; useHybridSearch?: boolean; alpha?: number; pathFileExternal?: string; stream?: boolean }
        }>, reply: FastifyReply) => {
            try {
                const { query, useHybridSearch = true, alpha = 0.5, pathFileExternal, stream = false } = request.body;
                
                if (stream) {
                    reply.raw.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type'
                    });

                    const sendEvent = (data: any) => {
                        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
                    };

                    try {
                        const streamResponse = await aiService.chatWithAIStream(
                            query, 
                            sendEvent,
                            useHybridSearch, 
                            alpha, 
                            pathFileExternal
                        );

                        sendEvent({ type: 'done', sources: streamResponse.sources });
                        reply.raw.end();
                    } catch (streamError) {
                        sendEvent({ type: 'error', error: streamError instanceof Error ? streamError.message : 'Unknown error' });
                        reply.raw.end();
                    }
                } else {
                    const response = await aiService.chatWithAI(query, useHybridSearch, alpha, pathFileExternal);

                    return reply.code(200).send({
                        success: true,
                        answer: response.answer,
                        sources: response.sources
                    });
                }
            } catch (error) {
                console.error('Erro no chat com IA:', error);
                return reply.code(500).send({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    });
}