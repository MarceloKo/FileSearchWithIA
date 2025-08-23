// src/utils/text-extraction.ts - atualizado para incluir imagens
import mammoth from 'mammoth';
import pdf from 'pdf-parse';
import xlsx from 'xlsx';
import { createWorker } from 'tesseract.js';
import sharp from 'sharp';

export interface ExtractedText {
    text: string;
    metadata: {
        filename: string;
        fileType: string;
        extractionDate: Date;
        totalPages?: number;
        totalWords?: number;
        slideCount?: number;
        imageWidth?: number;
        imageHeight?: number;
    };
}

// Função auxiliar para processar imagens com OCR
async function extractTextFromImage(buffer: Buffer): Promise<string> {
    try {
        // Pré-processar a imagem para melhor reconhecimento de OCR
        const processedImageBuffer = await sharp(buffer)
            .grayscale() // Converter para escala de cinza
            .normalise() // Normalizar o contraste
            .toBuffer();

        // Usar Tesseract.js para OCR
        const worker = await createWorker('por+eng'); // Suporte para português e inglês

        // Processar a imagem
        const { data } = await worker.recognize(processedImageBuffer);

        // Liberar recursos
        await worker.terminate();

        return data.text;
    } catch (error) {
        console.error('Erro no processamento OCR:', error);
        return '[Erro ao extrair texto da imagem]';
    }
}

export async function extractTextFromBuffer(
    buffer: Buffer,
    filename: string,
    mimeType: string
): Promise<ExtractedText> {
    let text = '';
    let metadata: any = {
        filename,
        fileType: mimeType,
        extractionDate: new Date()
    };

    // Extract text based on file type
    if (mimeType === 'application/pdf') {
        const data = await pdf(buffer);
        text = data.text;
        metadata.totalPages = data.numpages;
    }
    // Word Documents (ambos formatos)
    else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || // .docx
        mimeType === 'application/msword' // .doc
    ) {
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
    }
    // PowerPoint (ambos formatos)
    else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || // .pptx
        mimeType === 'application/vnd.ms-powerpoint' // .ppt
    ) {
        // Para PowerPoint, usamos xlsx para extrair o texto
        try {
            const workbook = xlsx.read(buffer, { type: 'buffer' });

            // PowerPoint armazena slides e notas em diferentes worksheets
            let slideCount = 0;
            let allText = '';

            workbook.SheetNames.forEach(sheetName => {
                if (sheetName.includes('Slide') || sheetName.includes('Notes')) {
                    slideCount++;
                    const sheet = workbook.Sheets[sheetName];
                    const slideText = xlsx.utils.sheet_to_txt(sheet);
                    allText += `Slide ${slideCount}:\n${slideText}\n\n`;
                }
            });

            text = allText;
            metadata.slideCount = slideCount;
        } catch (error) {
            console.error('Erro ao processar arquivo PowerPoint:', error);
            text = `[Erro ao extrair texto do PowerPoint: ${error instanceof Error ? error.message : 'Erro desconhecido'}]`;
        }
    }
    // Excel (ambos formatos) 
    else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mimeType === 'application/vnd.ms-excel'
    ) {
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        let allText = '';

        // Extract text from each sheet
        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const sheetText = xlsx.utils.sheet_to_txt(sheet);
            allText += `Sheet: ${sheetName}\n${sheetText}\n\n`;
        });

        text = allText;
    }
    // Arquivos de imagem (PNG, JPEG, GIF, etc.)
    else if (
        mimeType.startsWith('image/')
    ) {
        try {
            // Obter informações da imagem
            const imageInfo = await sharp(buffer).metadata();
            metadata.imageWidth = imageInfo.width;
            metadata.imageHeight = imageInfo.height;

            // Extrair texto da imagem via OCR
            text = await extractTextFromImage(buffer);

            // Adicionar informações sobre a imagem ao texto
            if (text.trim().length === 0) {
                text = '[Imagem sem texto detectável]';
            } else {
                text = `[Texto extraído da imagem]\n\n${text}`;
            }
        } catch (error) {
            console.error('Erro ao processar imagem:', error);
            text = `[Erro ao processar imagem: ${error instanceof Error ? error.message : 'Erro desconhecido'}]`;
        }
    } else if (mimeType === 'text/plain') {
        text = buffer.toString('utf-8');
    } else {
        throw new Error(`Tipo de arquivo não suportado: ${mimeType}`);
    }

    // Compute basic metadata
    metadata.totalWords = text.split(/\s+/).length;

    return {
        text,
        metadata
    };
}