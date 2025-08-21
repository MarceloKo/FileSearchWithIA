import { OpenAI } from 'openai';
import { QdrantService, SearchResult } from './qdrant.service';
import { MinioService } from './minio.service';
import config from '../config';

export class AIService {
    private openai: OpenAI;
    private qdrantService: QdrantService;
    private minioService: MinioService;

    constructor() {
        this.openai = new OpenAI({
            apiKey: config.openai.apiKey
        });
        this.qdrantService = new QdrantService();
        this.minioService = new MinioService();
    }

    async chatWithAI(query: string): Promise<{ answer: string, sources: any[] }> {
        try {
            const searchResults = await this.qdrantService.searchSimilar(query);

            if (searchResults.length === 0) {
                return {
                    answer: "I couldn't find any relevant information in your documents.",
                    sources: []
                };
            }

            // Format context from search results
            const context = searchResults.map((result, i) =>
                `Document ${i + 1}: ${result.payload.metadata.filename}\n${result.payload.text}`
            ).join('\n\n');

            // Generate a list of sources
            const sources = await Promise.all(
                searchResults.map(async (result) => {
                    const fileUrl = await this.minioService.getFileUrl(result.payload.metadata.fileUrl);
                    return {
                        filename: result.payload.metadata.filename,
                        fileUrl,
                        relevance: result.score,
                        excerpt: result.payload.text.substring(0, 150) + '...'
                    };
                })
            );

            // Prompt for the AI
            const systemPrompt = `Você é um assistente de IA que responde a perguntas com base no contexto do documento fornecido.
            Se a resposta não puder ser encontrada no contexto, diga que não sabe com base nas informações disponíveis.
            Sempre cite suas fontes, mencionando qual(is) documento(s) continha(m) a informação.`;

            // Get response from OpenAI
            const response = await this.openai.chat.completions.create({
                model: config.openai.chatModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` }
                ],
                temperature: 0.3,
                max_tokens: 5000
            });

            return {
                answer: response.choices[0].message.content || "I couldn't generate a response.",
                sources
            };
        } catch (error) {
            console.error('Error in AI chat:', error);
            throw new Error('Failed to process your query');
        }
    }
}