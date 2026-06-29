/** Déclaration minimale pour le sous-module Node de pdf-parse v1 (pas de types fournis). */
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PDFParseResult {
    text: string;
    numpages: number;
    numrender: number;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer | Uint8Array): Promise<PDFParseResult>;
  export default pdfParse;
}
