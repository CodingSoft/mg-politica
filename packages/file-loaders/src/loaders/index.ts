import type { FileLoaderInterface, SupportedFileType } from '../types';
import { polyfillDOMMatrixPureJS } from './domMatrixPolyfill';

// Lazy loader factory type - returns a Promise that resolves to the loader class
type LazyLoaderFactory = () => Promise<new () => FileLoaderInterface>;

// Loader configuration map using lazy imports
// This prevents pdfjs-dist from being loaded at module initialization
// and only loads it when PDF files need to be processed
const lazyFileLoaders: Record<SupportedFileType, LazyLoaderFactory> = {
  doc: async () => {
    const { DocLoader } = await import('./doc');
    return DocLoader;
  },
  docx: async () => {
    const { DocxLoader } = await import('./docx');
    return DocxLoader;
  },
  excel: async () => {
    const { ExcelLoader } = await import('./excel');
    return ExcelLoader;
  },
  pdf: async () => {
    // Polyfill DOMMatrix for Node.js environment before importing pdfjs-dist
    // pdfjs-dist 5.x uses DOMMatrix at module initialization which doesn't exist in Node.js
    if (typeof globalThis.DOMMatrix === 'undefined') {
      try {
        const canvas = require('@napi-rs/canvas');
        globalThis.DOMMatrix = canvas.DOMMatrix;
        globalThis.DOMPoint = canvas.DOMPoint;
        globalThis.DOMRect = canvas.DOMRect;
        globalThis.Path2D = canvas.Path2D;
      } catch (e) {
        // @napi-rs/canvas not available (e.g. Docker without native binaries)
        // Provide pure-JS fallbacks so pdfjs-dist can at least extract text.
        // Visual rendering will be broken but text parsing works fine.
        console.warn(
          '[file-loaders] @napi-rs/canvas not available, using pure-JS DOMMatrix polyfill. ' +
            'PDF rendering may be broken but text extraction will work.',
          (e as Error)?.message || e,
        );
        polyfillDOMMatrixPureJS();
      }
    }
    const { PdfLoader } = await import('./pdf');
    return PdfLoader;
  },
  pptx: async () => {
    const { PptxLoader } = await import('./pptx');
    return PptxLoader;
  },
  txt: async () => {
    const { TextLoader } = await import('./text');
    return TextLoader;
  },
};

/**
 * Get a file loader class for the specified file type.
 * Uses dynamic imports to avoid loading heavy dependencies (like pdfjs-dist) until needed.
 * Falls back to TextLoader if no specific loader is found.
 */
export const getFileLoader = async (
  fileType: SupportedFileType | string,
): Promise<new () => FileLoaderInterface> => {
  const loaderFactory = lazyFileLoaders[fileType as SupportedFileType];
  if (!loaderFactory) {
    // Fallback to TextLoader for unsupported file types
    const { TextLoader } = await import('./text');
    return TextLoader;
  }
  return loaderFactory();
};

// For backward compatibility - but prefer using getFileLoader for lazy loading
// This is kept to avoid breaking existing imports, but it will trigger immediate loading
// of all loaders. Consider migrating to getFileLoader.
export { lazyFileLoaders as fileLoaderFactories };
