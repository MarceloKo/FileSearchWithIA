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
            description: 'Chat with AI about your documents',
            tags: ['ai'],
            body: {
                type: 'object',
                properties: {
                    query: { type: 'string' },
                    useHybridSearch: { type: 'boolean', default: true },
                    alpha: { type: 'number', default: 0.5, minimum: 0, maximum: 1 }
                },
                required: ['query']
            },
            response: {
                200: chatResponseSchema
            }
        },
        handler: async (request: FastifyRequest<{
            Body: { query: string; useHybridSearch?: boolean; alpha?: number }
        }>, reply: FastifyReply) => {
            try {
                const { query, useHybridSearch = true, alpha = 0.5 } = request.body;
                const response = await aiService.chatWithAI(query, useHybridSearch, alpha);

                return reply.code(200).send({
                    success: true,
                    answer: response.answer,
                    sources: response.sources
                });
            } catch (error) {
                console.error('Error in AI chat:', error);
                return reply.code(500).send({
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
    });
}