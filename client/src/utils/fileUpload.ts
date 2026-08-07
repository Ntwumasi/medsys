// Shared preparation for every file the app uploads to POST /documents.
//
// Why this exists: uploads are sent as a base64 data URL inside a JSON body,
// and the API runs as a Vercel serverless function, which hard-caps a request
// body at ~4.5MB. Base64 inflates bytes by 4/3, so the real ceiling is about
// 3.3MB of actual file. Past that Vercel rejects at the edge with a 413 that
// never reaches Express, so neither the server's size check nor its error
// handler ever runs and the user just sees an opaque failure.
//
// Rather than advertise a limit we cannot honour, we shrink images to fit
// (a phone photo of a document survives this with no loss of legibility) and
// give a plain-English error for the file types we cannot shrink.

/** Largest file we can put on the wire, after any compression. */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // 3MB → ~4.0MB base64, safely under Vercel's 4.5MB

/** Largest image we will accept as *input*; it gets compressed down to MAX_UPLOAD_BYTES. */
export const MAX_IMAGE_INPUT_BYTES = 50 * 1024 * 1024;

/** Longest edge to keep when downscaling. 2400px keeps A4 text crisp at ~200dpi. */
const EDGE_STEPS = [2400, 2000, 1600, 1200];
const QUALITY_STEPS = [0.82, 0.72, 0.62, 0.5, 0.4];

export class UploadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadTooLargeError';
  }
}

export const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export interface PreparedUpload {
  /** `data:<mime>;base64,...` — send as `file_data`. */
  dataUrl: string;
  /** May differ from the original when a PNG/HEIC was re-encoded as JPEG. */
  fileName: string;
  /** May differ from the original for the same reason. */
  fileType: string;
  /** Decoded size of what we are actually sending. */
  bytes: number;
  originalBytes: number;
  compressed: boolean;
}

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });

/** Decoded byte count of a `data:...;base64,...` URL, without allocating a Buffer. */
const dataUrlBytes = (dataUrl: string): number => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

const decodeImage = async (file: File): Promise<Decoded> => {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Some formats (notably HEIC on desktop Chrome) can't be decoded here —
      // fall through to <img>, which occasionally succeeds where bitmap fails.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read this image'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
};

/**
 * Downscale + re-encode an image until it fits the wire budget.
 * Returns null if the browser can't decode the image at all, so the caller
 * can fall back to sending it untouched (and hitting the plain size check).
 */
const compressImage = async (file: File, budget: number): Promise<PreparedUpload | null> => {
  let decoded: Decoded;
  try {
    decoded = await decodeImage(file);
  } catch {
    return null;
  }

  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    let best: string | null = null;

    for (const edge of EDGE_STEPS) {
      const scale = Math.min(1, edge / Math.max(decoded.width, decoded.height));
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));

      // Scans and photos of paper are mostly white; JPEG has no alpha, so paint
      // a white ground first or transparent PNG regions come out black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITY_STEPS) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (!dataUrl.startsWith('data:image/jpeg')) return null; // encoder refused
        best = dataUrl;
        if (dataUrlBytes(dataUrl) <= budget) {
          const baseName = file.name.replace(/\.[^.]+$/, '') || 'scan';
          return {
            dataUrl,
            fileName: `${baseName}.jpg`,
            fileType: 'image/jpeg',
            bytes: dataUrlBytes(dataUrl),
            originalBytes: file.size,
            compressed: true,
          };
        }
      }
    }

    // Exhausted every step and it still doesn't fit — extraordinarily unlikely
    // for a real scan, but don't pretend it worked.
    if (best) {
      throw new UploadTooLargeError(
        `${file.name} is too detailed to compress under ${formatBytes(budget)}. ` +
          `Try scanning it at a lower resolution.`
      );
    }
    return null;
  } finally {
    decoded.close();
  }
};

/**
 * Turn a picked file into something we can actually POST.
 * Images are compressed to fit; everything else must already fit.
 * Throws {@link UploadTooLargeError} with a message worth showing the user.
 */
export const prepareFileForUpload = async (file: File): Promise<PreparedUpload> => {
  const isImage = file.type.startsWith('image/');

  if (isImage && file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new UploadTooLargeError(
      `${file.name} is ${formatBytes(file.size)} — larger than the ${formatBytes(
        MAX_IMAGE_INPUT_BYTES
      )} limit for images.`
    );
  }

  if (isImage && file.size > MAX_UPLOAD_BYTES) {
    const compressed = await compressImage(file, MAX_UPLOAD_BYTES);
    if (compressed) return compressed;
    // Browser couldn't decode it (e.g. HEIC): fall through to the size check.
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadTooLargeError(
      `${file.name} is ${formatBytes(file.size)}. The limit for ${
        isImage ? 'this image format' : 'PDFs and documents'
      } is ${formatBytes(MAX_UPLOAD_BYTES)}. ` +
        (isImage
          ? 'Re-save it as a JPG or PNG and it will be compressed automatically.'
          : 'Photograph or re-scan the pages as JPG/PNG instead — images are compressed automatically — or split the PDF.')
    );
  }

  const dataUrl = await readAsDataUrl(file);
  return {
    dataUrl,
    fileName: file.name,
    fileType: file.type || 'application/octet-stream',
    bytes: file.size,
    originalBytes: file.size,
    compressed: false,
  };
};
