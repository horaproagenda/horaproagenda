export type FilePreviewKind = 'image' | 'pdf' | 'other';

/**
 * Determines how a locally selected file should be previewed in the
 * upload UI. Kept as a pure helper so regressions in the preview
 * detection can be caught without rendering the full component.
 */
export const detectFilePreviewKind = (file: File | null | undefined): FilePreviewKind | null => {
  if (!file) return null;
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(name)) return 'image';
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  return 'other';
};
