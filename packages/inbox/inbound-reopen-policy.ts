export function restoredAiState(closeFromMode: string | null | undefined) {
  // Historical closes without reliable mode evidence stay paused.
  return closeFromMode === 'AI';
}
