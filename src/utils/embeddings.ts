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

        if (embedding.length !== 1536) {
            console.warn(`AVISO: O embedding gerado tem ${embedding.length} dimensões, mas a coleção espera 1536 dimensões`);
        }

        return embedding;
    } catch (error) {
        console.error('Erro ao gerar embedding:', error);
        throw new Error('Falha ao gerar embedding');
    }
}

export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    try {
        const truncatedTexts = texts.map(text => text.slice(0, 8000));

        console.log(`Gerando ${truncatedTexts.length} embeddings em lote...`);

        const response = await openai.embeddings.create({
            model: config.openai.embeddingModel,
            input: truncatedTexts
        });

        const embeddings = response.data.map(item => item.embedding);

        if (embeddings.length !== texts.length) {
            throw new Error(`Esperado ${texts.length} embeddings, mas recebido ${embeddings.length}`);
        }

        if (embeddings[0].length !== 1536) {
            console.warn(`AVISO: Os embeddings gerados têm ${embeddings[0].length} dimensões, mas a coleção espera 1536 dimensões`);
        }

        console.log(`✅ ${embeddings.length} embeddings gerados com sucesso`);
        return embeddings;
    } catch (error) {
        console.error('Erro ao gerar embeddings em lote:', error);
        throw new Error('Falha ao gerar embeddings em lote');
    }
}