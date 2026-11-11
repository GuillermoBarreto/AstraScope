import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

describe('copyText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'execCommand');
  });

  it('uses the Clipboard API when it is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyText('share me')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('share me');
  });

  it('falls back to the compatibility copy command', async () => {
    vi.stubGlobal('navigator', {});
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    await expect(copyText('fallback')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('pins the fallback textarea to the viewport corner', async () => {
    vi.stubGlobal('navigator', {});
    let seen: HTMLTextAreaElement | null = null;
    const execCommand = vi.fn().mockImplementation(() => {
      // Capture the element while it is still in the document: the
      // fallback removes it in a finally block.
      seen = document.querySelector('textarea');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });

    await expect(copyText('fallback')).resolves.toBe(true);
    expect(seen?.style.position).toBe('fixed');
    expect(seen?.style.top).toBe('0px');
    expect(seen?.style.left).toBe('0px');
  });

  it('reports failure when both copy methods are unavailable', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: undefined });

    await expect(copyText('blocked')).resolves.toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
