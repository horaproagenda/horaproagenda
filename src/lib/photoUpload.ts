/**
 * Photo upload helpers that guarantee the ORIGINAL file bytes are stored —
 * no client-side resizing, re-encoding, or quality reduction.
 *
 * All photos (client profile avatar, professional avatar, client photos gallery)
 * must go through these helpers so resolution and quality are preserved.
 */
import { supabase } from '@/integrations/supabase/client';

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024; // 25MB — supports modern smartphone photos at full resolution

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/tiff': 'tiff',
  'image/bmp': 'bmp',
};

export function getSafeExtension(file: File): string {
  const rawExt = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (rawExt && rawExt.length <= 5) return rawExt;
  return MIME_TO_EXT[file.type?.toLowerCase()] || 'jpg';
}

export function getSafeContentType(file: File): string {
  if (file.type && file.type.startsWith('image/')) return file.type;
  // Fallback based on extension — never re-encode.
  const ext = getSafeExtension(file);
  const entry = Object.entries(MIME_TO_EXT).find(([, e]) => e === ext);
  return entry?.[0] || 'image/jpeg';
}

export type PhotoValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

export function validatePhotoFile(file: File): PhotoValidationResult {
  if (!file.type.startsWith('image/') && !MIME_TO_EXT[file.type?.toLowerCase()]) {
    // Some mobile browsers report an empty type for HEIC — allow via extension.
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif', 'gif', 'tiff', 'bmp'].includes(ext)) {
      return { ok: false, reason: 'Selecione um arquivo de imagem (JPG, PNG, HEIC, WebP, AVIF).' };
    }
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, reason: `A foto ultrapassa ${Math.round(MAX_PHOTO_BYTES / (1024 * 1024))} MB. Envie uma imagem menor.` };
  }
  if (file.size === 0) {
    return { ok: false, reason: 'O arquivo está vazio.' };
  }
  return { ok: true };
}

/**
 * Uploads a photo preserving the original bytes and metadata.
 * NEVER call any canvas/toBlob/resize before this — the goal is full fidelity.
 */
export async function uploadOriginalPhoto(params: {
  bucket: string;
  path: string;
  file: File;
  upsert?: boolean;
}): Promise<{ path: string }> {
  const { bucket, path, file, upsert = true } = params;
  const contentType = getSafeContentType(file);

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      upsert,
      contentType,
      // 1 year immutable cache — filenames are unique per timestamp so cache-busting is automatic.
      cacheControl: '31536000',
    });

  if (error) throw error;
  return { path: data.path };
}
