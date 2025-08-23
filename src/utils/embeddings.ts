import { OpenAI } from 'openai';
import config from '../config';

const openai = new OpenAI({
    apiKey: config.openai.apiKey
});

export async function generateEmbedding(text: string): Promise<number[]> {
    try {
        const truncatedText = text.slice(0, 8000);

        const response = await openai.embeddings.create({
            model: config.openai.embeddingModel,
            input: truncatedText
        });

        const embedding = response.data[0].embedding;

        // Verificar se o tamanho do embedding corresponde ao esperado
        if (embedding.length !== 1536) {
            console.warn(`AVISO: O embedding gerado tem ${embedding.length} dimensões, mas a coleção espera 1536 dimensões`);
        }

        return embedding;
    } catch (error) {
        console.error('Erro ao gerar embedding:', error);
        throw new Error('Falha ao gerar embedding');
    }
}