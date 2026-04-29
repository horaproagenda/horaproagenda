import { supabase } from '@/integrations/supabase/client';

type CachedBlob = {
  blob: Blob;
  expiresAt: number;
};

const blobCache = new Map<string, CachedBlob>();
const pendingBlobRequests = new Map<string, Promise<Blob>>();

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export const getSafeFileName = (name: string, fallback = 'arquivo') => {
  const cleanName = (name || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  return cleanName || fallback;
};

export const getFileNameWithExtension = (title: string, source?: string | null, fallback = 'documento') => {
  const baseName = getSafeFileName(title, fallback);
  const sourceName = String(source || '').split('?')[0].split('/').pop() || '';
  const extension = sourceName.includes('.') ? `.${sourceName.split('.').pop()}` : '';

  if (!extension || baseName.toLowerCase().endsWith(extension.toLowerCase())) return baseName;
  return `${baseName}${extension}`;
};

export const getStorageBlob = async ({
  bucket,
  filePath,
  fileUrl,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
}: {
  bucket: string;
  filePath?: string | null;
  fileUrl?: string | null;
  cacheTtlMs?: number;
}) => {
  const cacheKey = filePath ? `${bucket}:${filePath}` : fileUrl || '';
  const cached = cacheKey ? blobCache.get(cacheKey) : null;

  if (cached && cached.expiresAt > Date.now()) return cached.blob;
  if (cacheKey && pendingBlobRequests.has(cacheKey)) return pendingBlobRequests.get(cacheKey)!;

  const request = (async () => {
    if (filePath) {
      const { data, error } = await supabase.storage.from(bucket).download(filePath);
      if (!error && data) return data;

      const signed = await supabase.storage.from(bucket).createSignedUrl(filePath, 300);
      if (signed.error || !signed.data?.signedUrl) throw error || signed.error;

      const response = await fetch(signed.data.signedUrl);
      if (!response.ok) throw new Error(`Falha ao carregar arquivo (${response.status})`);
      return response.blob();
    }

    if (!fileUrl) throw new Error('Arquivo sem caminho válido');
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Falha ao carregar arquivo (${response.status})`);
    return response.blob();
  })();

  if (cacheKey) pendingBlobRequests.set(cacheKey, request);

  try {
    const blob = await request;
    if (cacheKey) blobCache.set(cacheKey, { blob, expiresAt: Date.now() + cacheTtlMs });
    return blob;
  } finally {
    if (cacheKey) pendingBlobRequests.delete(cacheKey);
  }
};

export const downloadBlob = (blob: Blob, fileName: string) => {
  const blobUrl = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = blobUrl;
  link.download = getSafeFileName(fileName);
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
};