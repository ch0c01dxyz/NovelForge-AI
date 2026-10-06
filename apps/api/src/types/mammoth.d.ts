/**
 * NF-WF-017A: ambient types for the `mammoth` DOCX converter.
 *
 * mammoth ships no TypeScript declarations; this file declares the
 * narrow surface 017A uses (convertToHtml + imgElement), pinned to the
 * behavior verified against mammoth@1.13.0 in the 017A fixture tests.
 */
declare module "mammoth" {
  export interface MammothConvertInput {
    buffer: Buffer;
  }
  export interface MammothConvertOptions {
    styleMap?: string[];
    convertImage?: unknown;
  }
  export interface MammothConvertResult {
    value: string;
    messages: Array<{ type: string; message: string }>;
  }
  export interface MammothImages {
    imgElement(fn: () => null): unknown;
  }
  const mammoth: {
    convertToHtml(
      input: MammothConvertInput,
      options?: MammothConvertOptions,
    ): Promise<MammothConvertResult>;
    images: MammothImages;
  };
  export default mammoth;
}
