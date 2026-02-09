import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to get a signed URL for a photo stored in the private client-photos bucket.
 * Returns null while loading, the signed URL when ready, or the fallback URL on error.
 */
export function useSignedPhotoUrl(filePath: string | null, fallbackUrl?: string | null) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!filePath) {
      setSignedUrl(fallbackUrl || null);
      setLoading(false);
      return;
    }

    const getSignedUrl = async () => {
      try {
        const { data, error } = await supabase.storage
          .from('client-photos')
          .createSignedUrl(filePath, 1800); // 30 minutes

        if (error) {
          console.error('Error getting signed URL:', error);
          // Fall back to stored URL if available
          setSignedUrl(fallbackUrl || null);
        } else {
          setSignedUrl(data.signedUrl);
        }
      } catch (err) {
        console.error('Error getting signed URL:', err);
        setSignedUrl(fallbackUrl || null);
      } finally {
        setLoading(false);
      }
    };

    getSignedUrl();
  }, [filePath, fallbackUrl]);

  return { signedUrl, loading };
}

/**
 * Utility function to get signed URLs for multiple photos at once.
 * This is more efficient than calling the hook for each photo.
 */
export async function getSignedPhotoUrls(
  photos: { file_path: string | null; file_url: string | null }[]
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();
  
  // Filter photos that have file_path
  const photosWithPath = photos.filter(p => p.file_path);
  
  if (photosWithPath.length === 0) return urlMap;

  // Get signed URLs in batch
  const promises = photosWithPath.map(async (photo) => {
    try {
      const { data, error } = await supabase.storage
        .from('client-photos')
        .createSignedUrl(photo.file_path!, 1800);
      
      if (!error && data) {
        urlMap.set(photo.file_path!, data.signedUrl);
      } else {
        // Fall back to stored URL
        if (photo.file_url) {
          urlMap.set(photo.file_path!, photo.file_url);
        }
      }
    } catch {
      if (photo.file_url) {
        urlMap.set(photo.file_path!, photo.file_url);
      }
    }
  });

  await Promise.all(promises);
  return urlMap;
}
