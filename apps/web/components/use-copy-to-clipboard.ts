import { useState, useCallback } from 'react';

export function useCopyToClipboard(timeout = 2000) {
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [copyText, setCopyText] = useState<string | null>(null);

  const copy = useCallback(async (text: string) => {
    if (!navigator?.clipboard) {
      setError(new Error('Clipboard not supported'));
      setCopyText(text);
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      setError(null);
      setCopyText(null);
      setTimeout(() => setIsCopied(false), timeout);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Copy failed'));
      setCopyText(text);
      return false;
    }
  }, [timeout]);

  const dismissError = useCallback(() => {
    setError(null);
    setCopyText(null);
  }, []);

  return { isCopied, error, copyText, copy, dismissError };
}
