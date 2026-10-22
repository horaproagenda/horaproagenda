import { describe, it, expect } from 'vitest';
import { releaseStaleScrollLocks } from '@/pages/Landing';

describe('página inicial sempre rola', () => {
  it('remove trava de rolagem deixada pelo app', () => {
    document.body.style.overflow = 'hidden';
    document.body.style.pointerEvents = 'none';
    document.body.setAttribute('data-scroll-locked', '1');
    document.documentElement.style.overflow = 'hidden';
    releaseStaleScrollLocks();
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.pointerEvents).toBe('');
    expect(document.body.hasAttribute('data-scroll-locked')).toBe(false);
    expect(document.documentElement.style.overflow).toBe('');
  });
});
