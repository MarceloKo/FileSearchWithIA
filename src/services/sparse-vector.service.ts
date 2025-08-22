import natural from 'natural';
import { removeStopwords, por, eng } from 'stopword';

export interface SparseVector {
  indices: number[];
  values: number[];
}

export class SparseVectorService {
  private tokenizer: natural.WordTokenizer;
  private vocabulary: Map<string, number> = new Map();
  private documentFrequency: Map<string, number> = new Map();
  private totalDocuments: number = 0;
  private averageDocLength: number = 0;
  private documentLengths: number[] = [];
  private readonly k1: number = 1.2;
  private readonly b: number = 0.75;

  constructor() {
    this.tokenizer = new natural.WordTokenizer();
  }

  private tokenize(text: string): string[] {
    const tokens = this.tokenizer.tokenize(text.toLowerCase()) || [];
    
    const stopwordsToRemove = [...por, ...eng];
    const filteredTokens = removeStopwords(tokens, stopwordsToRemove);
    
    const stemmer = natural.PorterStemmerPt;
    return filteredTokens.map((token: string) => stemmer.stem(token));
  }

  public buildVocabulary(documents: string[]): void {
    this.vocabulary.clear();
    this.documentFrequency.clear();
    this.documentLengths = [];
    
    let vocabularyIndex = 0;
    const allDocumentTokens: string[][] = [];

    for (const doc of documents) {
      const tokens = this.tokenize(doc);
      allDocumentTokens.push(tokens);
      this.documentLengths.push(tokens.length);
      
      const uniqueTokens = new Set(tokens);
      
      for (const token of uniqueTokens) {
        if (!this.vocabulary.has(token)) {
          this.vocabulary.set(token, vocabularyIndex++);
        }
        
        this.documentFrequency.set(
          token,
          (this.documentFrequency.get(token) || 0) + 1
        );
      }
    }

    this.totalDocuments = documents.length;
    this.averageDocLength = this.documentLengths.reduce((a, b) => a + b, 0) / this.totalDocuments;
  }

  private calculateBM25Score(
    termFreq: number,
    docFreq: number,
    docLength: number
  ): number {
    const idf = Math.log(
      (this.totalDocuments - docFreq + 0.5) / (docFreq + 0.5) + 1
    );
    
    const numerator = termFreq * (this.k1 + 1);
    const denominator = termFreq + this.k1 * (
      1 - this.b + this.b * (docLength / this.averageDocLength)
    );
    
    return idf * (numerator / denominator);
  }

  public createSparseVector(text: string): SparseVector {
    const tokens = this.tokenize(text);
    const termFrequency = new Map<string, number>();
    
    for (const token of tokens) {
      termFrequency.set(token, (termFrequency.get(token) || 0) + 1);
    }

    const indices: number[] = [];
    const values: number[] = [];

    for (const [term, freq] of termFrequency) {
      const vocabIndex = this.vocabulary.get(term);
      if (vocabIndex !== undefined) {
        const docFreq = this.documentFrequency.get(term) || 0;
        const bm25Score = this.calculateBM25Score(
          freq,
          docFreq,
          tokens.length
        );
        
        if (bm25Score > 0) {
          indices.push(vocabIndex);
          values.push(bm25Score);
        }
      }
    }

    return { indices, values };
  }

  public createQueryVector(query: string): SparseVector {
    return this.createSparseVector(query);
  }

  public getVocabularySize(): number {
    return this.vocabulary.size;
  }

  public addDocument(text: string): void {
    const tokens = this.tokenize(text);
    this.documentLengths.push(tokens.length);
    
    const uniqueTokens = new Set(tokens);
    
    for (const token of uniqueTokens) {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, this.vocabulary.size);
      }
      
      this.documentFrequency.set(
        token,
        (this.documentFrequency.get(token) || 0) + 1
      );
    }
    
    this.totalDocuments++;
    this.averageDocLength = this.documentLengths.reduce((a, b) => a + b, 0) / this.totalDocuments;
  }
}

export const sparseVectorService = new SparseVectorService();