import { ExtractedText } from './text-extraction';

export interface SmartChunk {
    text: string;
    metadata: any;
    chunkIndex: number;
    isPortaria?: boolean;
    portariaNumber?: string;
}

export class SmartChunker {
    private static LEGAL_DOC_PATTERNS = [
        { pattern: /PORT[AÁ]RIA\s*N[º°]?\s*\d+\/\d+/gi, type: 'PORTARIA' },
        { pattern: /DECRETO\s*N[º°]?\s*\d+\/\d+/gi, type: 'DECRETO' },
        { pattern: /LEI\s*N[º°]?\s*\d+\/\d+/gi, type: 'LEI' },
        { pattern: /RESOLU[ÇC][ÃA]O\s*N[º°]?\s*\d+\/\d+/gi, type: 'RESOLUÇÃO' },
        { pattern: /INSTRU[ÇC][ÃA]O\s*NORMATIVA\s*N[º°]?\s*\d+\/\d+/gi, type: 'INSTRUÇÃO NORMATIVA' },
        { pattern: /EDITAL\s*N[º°]?\s*\d+\/\d+/gi, type: 'EDITAL' },
        { pattern: /OF[ÍI]CIO\s*N[º°]?\s*\d+\/\d+/gi, type: 'OFÍCIO' },
        { pattern: /PARECER\s*N[º°]?\s*\d+\/\d+/gi, type: 'PARECER' }
    ];

    private static SECTION_MARKERS = [
        /^Art\.\s*\d+/m,
        /^§\s*\d+/m,
        /^CAPÍTULO/m,
        /^SEÇÃO/m,
        /^ANEXO/m,
        /^RESOLVE:/m,
        /^CONSIDERANDO/m
    ];

    static chunkTextSmart(
        extractedText: ExtractedText,
        chunkSize: number = 500,
        chunkOverlap: number = 100
    ): SmartChunk[] {
        const text = extractedText.text;
        const chunks: SmartChunk[] = [];
        
        const legalDocs = this.extractLegalDocuments(text);
        
        if (legalDocs.length > 0) {
            chunks.push(...this.chunkLegalDocuments(legalDocs, extractedText.metadata));
        }
        
        const regularChunks = this.createRegularChunks(text, extractedText.metadata, chunkSize, chunkOverlap);
        chunks.push(...regularChunks);
        
        return this.deduplicateChunks(chunks);
    }

    private static extractLegalDocuments(text: string): Array<{text: string, number: string, type: string, startIndex: number, endIndex: number}> {
        const legalDocs: Array<{text: string, number: string, type: string, startIndex: number, endIndex: number}> = [];
        
        for (const docPattern of this.LEGAL_DOC_PATTERNS) {
            let match;
            const regex = new RegExp(docPattern.pattern.source, docPattern.pattern.flags);
            
            while ((match = regex.exec(text)) !== null) {
                const startIndex = match.index;
                let endIndex = text.length;
                
                // Procurar pelo próximo documento legal de qualquer tipo
                const nextDocMatch = this.findNextLegalDocument(text, startIndex + match[0].length);
                if (nextDocMatch !== -1) {
                    endIndex = nextDocMatch;
                }
                
                const resolveIndex = text.indexOf('RESOLVE:', startIndex);
                const considerandoIndex = text.indexOf('CONSIDERANDO', startIndex);
                
                if (resolveIndex !== -1 && resolveIndex < endIndex) {
                    const nextSectionIndex = this.findNextSection(text, resolveIndex + 8);
                    if (nextSectionIndex !== -1 && nextSectionIndex < endIndex) {
                        endIndex = nextSectionIndex;
                    }
                }
                
                const docText = text.slice(startIndex, Math.min(endIndex, startIndex + 3000));
                
                legalDocs.push({
                    text: docText,
                    number: match[0],
                    type: docPattern.type,
                    startIndex,
                    endIndex: Math.min(endIndex, startIndex + 3000)
                });
            }
        }
        
        return legalDocs;
    }
    
    private static findNextLegalDocument(text: string, fromIndex: number): number {
        let minIndex = -1;
        
        for (const docPattern of this.LEGAL_DOC_PATTERNS) {
            const regex = new RegExp(docPattern.pattern.source, docPattern.pattern.flags);
            const match = text.slice(fromIndex).search(regex);
            if (match !== -1) {
                const absoluteIndex = fromIndex + match;
                if (minIndex === -1 || absoluteIndex < minIndex) {
                    minIndex = absoluteIndex;
                }
            }
        }
        
        return minIndex;
    }

    private static findNextSection(text: string, fromIndex: number): number {
        let minIndex = -1;
        
        for (const marker of this.SECTION_MARKERS) {
            const index = text.slice(fromIndex).search(marker);
            if (index !== -1) {
                const absoluteIndex = fromIndex + index;
                if (minIndex === -1 || absoluteIndex < minIndex) {
                    minIndex = absoluteIndex;
                }
            }
        }
        
        return minIndex;
    }

    private static chunkLegalDocuments(
        legalDocs: Array<{text: string, number: string, type: string, startIndex: number, endIndex: number}>,
        baseMetadata: any
    ): SmartChunk[] {
        const chunks: SmartChunk[] = [];
        
        legalDocs.forEach((doc, index) => {
            const words = doc.text.split(/\s+/);
            
            if (words.length <= 600) {
                chunks.push({
                    text: doc.text,
                    metadata: {
                        ...baseMetadata,
                        isLegalDocument: true,
                        documentNumber: doc.number,
                        documentType: doc.type,
                        documentSection: doc.type.toLowerCase(),
                        startIndex: doc.startIndex,
                        endIndex: doc.endIndex
                    },
                    chunkIndex: index,
                    isPortaria: doc.type === 'PORTARIA',
                    portariaNumber: doc.type === 'PORTARIA' ? doc.number : undefined
                });
            } else {
                let startIdx = 0;
                let subChunkIndex = 0;
                
                while (startIdx < words.length) {
                    const endIdx = Math.min(startIdx + 500, words.length);
                    const chunkText = words.slice(startIdx, endIdx).join(' ');
                    
                    chunks.push({
                        text: `${doc.number} (Parte ${subChunkIndex + 1})\n\n${chunkText}`,
                        metadata: {
                            ...baseMetadata,
                            isLegalDocument: true,
                            documentNumber: doc.number,
                            documentType: doc.type,
                            documentPart: subChunkIndex + 1,
                            documentSection: doc.type.toLowerCase(),
                            startIndex: doc.startIndex,
                            endIndex: doc.endIndex
                        },
                        chunkIndex: index * 100 + subChunkIndex,
                        isPortaria: doc.type === 'PORTARIA',
                        portariaNumber: doc.type === 'PORTARIA' ? doc.number : undefined
                    });
                    
                    startIdx += 400;
                    subChunkIndex++;
                }
            }
        });
        
        return chunks;
    }

    private static createRegularChunks(
        text: string,
        baseMetadata: any,
        chunkSize: number,
        chunkOverlap: number
    ): SmartChunk[] {
        const chunks: SmartChunk[] = [];
        const sentences = this.splitIntoSentences(text);
        
        let currentChunk: string[] = [];
        let currentWordCount = 0;
        let chunkIndex = 1000;
        
        for (const sentence of sentences) {
            const words = sentence.split(/\s+/);
            
            if (currentWordCount + words.length > chunkSize && currentChunk.length > 0) {
                chunks.push({
                    text: currentChunk.join(' '),
                    metadata: {
                        ...baseMetadata,
                        chunkIndex,
                        wordCount: currentWordCount
                    },
                    chunkIndex
                });
                
                const overlapWords = Math.min(chunkOverlap, currentWordCount);
                const allWords = currentChunk.join(' ').split(/\s+/);
                currentChunk = allWords.slice(-overlapWords).join(' ').split(/(?<=[.!?])\s+/);
                currentWordCount = overlapWords;
                chunkIndex++;
            }
            
            currentChunk.push(sentence);
            currentWordCount += words.length;
        }
        
        if (currentChunk.length > 0) {
            chunks.push({
                text: currentChunk.join(' '),
                metadata: {
                    ...baseMetadata,
                    chunkIndex,
                    wordCount: currentWordCount
                },
                chunkIndex
            });
        }
        
        return chunks;
    }

    private static splitIntoSentences(text: string): string[] {
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
        
        const processedSentences: string[] = [];
        let currentSentence = '';
        
        for (const sentence of sentences) {
            if (sentence.match(/\b(Art|Inc|§|n[º°])\s*\d*\.?$/)) {
                currentSentence += sentence + ' ';
            } else {
                if (currentSentence) {
                    processedSentences.push(currentSentence + sentence);
                    currentSentence = '';
                } else {
                    processedSentences.push(sentence);
                }
            }
        }
        
        if (currentSentence) {
            processedSentences.push(currentSentence.trim());
        }
        
        return processedSentences;
    }

    private static deduplicateChunks(chunks: SmartChunk[]): SmartChunk[] {
        const seen = new Set<string>();
        const uniqueChunks: SmartChunk[] = [];
        
        for (const chunk of chunks) {
            const normalizedText = chunk.text.toLowerCase().replace(/\s+/g, ' ').trim();
            const hash = normalizedText.substring(0, 100);
            
            if (!seen.has(hash)) {
                seen.add(hash);
                uniqueChunks.push(chunk);
            }
        }
        
        return uniqueChunks;
    }
}