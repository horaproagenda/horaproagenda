/** Discard responses and cached data from a previous authenticated identity. */
export function sessionIdentityChanged(previous: string | null, next: string | null): boolean {
  return previous !== next;
}

export function isCurrentSessionResponse(requestUserId: string, currentUserId: string | null): boolean {
  return requestUserId === currentUserId;
}