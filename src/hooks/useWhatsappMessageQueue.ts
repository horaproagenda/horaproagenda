import { useEffect, useState } from 'react';
import { whatsappMessageQueue, type QueueSnapshot } from '@/lib/whatsappMessageQueue';

export function useWhatsappMessageQueue() {
  const [snapshot, setSnapshot] = useState<QueueSnapshot>(() => whatsappMessageQueue.snapshot());

  useEffect(() => whatsappMessageQueue.subscribe(setSnapshot), []);

  return {
    snapshot,
    enqueue: whatsappMessageQueue.enqueue.bind(whatsappMessageQueue),
    retryFailed: whatsappMessageQueue.retryFailed.bind(whatsappMessageQueue),
    clearDone: whatsappMessageQueue.clearDone.bind(whatsappMessageQueue),
    pause: whatsappMessageQueue.pause.bind(whatsappMessageQueue),
    resume: whatsappMessageQueue.resume.bind(whatsappMessageQueue),
  };
}
