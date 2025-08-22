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

    async chatWithAI(query: string, useHybridSearch: boolean = true, alpha: number = 0.5, pathFileExternal?: string): Promise<{ answer: string, sources: any[] }> {
        try {
            const filter = pathFileExternal ? {
                must: [
                    {
                        key: "metadata.path_file_external",
                        match: {
                            text: pathFileExternal
                        }
                    }
                ]
            } : undefined;

            const searchResults = useHybridSearch
                ? await this.qdrantService.hybridSearch(query, filter, 5, alpha)
                : await this.qdrantService.searchSimilar(query, filter);

            if (searchResults.length === 0) {
                return {
                    answer: "I couldn't find any relevant information in your documents.",
                    sources: []
                };
            }

            const context = searchResults.map((result, i) =>
                `Document ${i + 1}: ${result.payload.metadata.filename}\n${result.payload.text}`
            ).join('\n\n');

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

            const systemPrompt = `Você é um assistente de IA que responde a perguntas com base no contexto do documento fornecido.
            Se a resposta não puder ser encontrada no contexto, diga que não sabe com base nas informações disponíveis.
            Sempre cite suas fontes, mencionando qual(is) documento(s) continha(m) a informação. Sempre retorne em português brasileiro. `;

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

    async chatWithAIStream(
        query: string,
        sendEvent: (data: any) => void,
        useHybridSearch: boolean = true,
        alpha: number = 0.5,
        pathFileExternal?: string
    ): Promise<{ sources: any[] }> {
        try {
            const filter = pathFileExternal ? {
                must: [
                    {
                        key: "metadata.path_file_external",
                        match: {
                            text: pathFileExternal
                        }
                    }
                ]
            } : undefined;

            const searchResults = useHybridSearch
                ? await this.qdrantService.hybridSearch(query, filter, 5, alpha)
                : await this.qdrantService.searchSimilar(query, filter);

            if (searchResults.length === 0) {
                sendEvent({ type: 'chunk', content: "I couldn't find any relevant information in your documents." });
                return { sources: [] };
            }

            const context = searchResults.map((result, i) =>
                `Document ${i + 1}: ${result.payload.metadata.filename}\n${result.payload.text}`
            ).join('\n\n');
            const sources = (await Promise.all(
                searchResults.map(async (result) => {
                    const fileUrl = await this.minioService.getFileUrl(result.payload.metadata.fileUrl).catch(error => {
                        return null;
                    });

                    return {
                        filename: result.payload.metadata.filename,
                        fileUrl: fileUrl || "",
                        relevance: result.score,
                        excerpt: result.payload.text.substring(0, 150) + '...'
                    };
                })
            ))

            const systemPrompt = `Você é um assistente de IA que responde a perguntas com base no contexto do documento fornecido.
            Se a resposta não puder ser encontrada no contexto, diga que não sabe com base nas informações disponíveis.
            Sempre cite suas fontes, mencionando qual(is) documento(s) continha(m) a informação.`;

            const stream = await this.openai.chat.completions.create({
                model: config.openai.chatModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Context:\n${context}\n\nQuestion: ${query}` }
                ],
                temperature: 0.3,
                max_tokens: 5000,
                stream: true
            });
            console.log("stream", stream);

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    sendEvent({ type: 'chunk', content });
                }
            }

            return { sources };
        } catch (error) {
            console.error('Error in AI chat stream:', error);
            throw new Error('Failed to process your query');
        }
    }
}