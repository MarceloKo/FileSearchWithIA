import { ExtractedText } from './text-extraction';

export interface TextChunk {
    text: string;
    metadata: any;
    chunkIndex: number;
}

export function chunkText(
    extractedText: ExtractedText,
    chunkSize: number = 500,
    chunkOverlap: number = 50
): TextChunk[] {
    const text = extractedText.text;
    const words = text.split(/\s+/);
    const chunks: TextChunk[] = [];

    // Simple chunking by words (approximation of tokens)
    let startIdx = 0;
    let chunkIndex = 0;

    while (startIdx < words.length) {
        const endIdx = Math.min(startIdx + chunkSize, words.length);
        const chunkText = words.slice(startIdx, endIdx).join(' ');

        chunks.push({
            text: chunkText,
            metadata: {
                ...extractedText.metadata,
                chunkIndex,
                startIdx,
                endIdx,
                totalChunks: Math.ceil(words.length / (chunkSize - chunkOverlap))
            },
            chunkIndex
        });

        // Move to next chunk with overlap
        startIdx += (chunkSize - chunkOverlap);
        chunkIndex++;
    }

    return chunks;
}