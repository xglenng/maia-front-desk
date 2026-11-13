export function setupReturnPath(value: string | null): string {
  return value === '/onboarding' || value === '/help' ? value : '/';
}
