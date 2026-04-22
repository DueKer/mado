import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    '的', '了', '和', '是', '在', '我', '有', '个', '人', '这',
    '不', '就', '也', '都', '要', '会', '能', '对', '将', '可',
    '以', '及', '与', '或', '等', '但', '如果', '因为', '所以',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  ]);

  return text
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()))
    .slice(0, 20);
}

export function keywordMatchScore(text: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const lower = text.toLowerCase();
  const matched = keywords.filter(k => lower.includes(k.toLowerCase()));
  return matched.length / keywords.length;
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}

// -------------------- API密钥加密存储 --------------------

const ENCODED_PREFIX = '__enc__:';

export function encodeSecret(value: string): string {
  if (!value) return value;
  try {
    return ENCODED_PREFIX + btoa(unescape(encodeURIComponent(value)));
  } catch {
    return value;
  }
}

export function decodeSecret(value: string): string {
  if (!value) return value;
  if (!value.startsWith(ENCODED_PREFIX)) return value;
  try {
    return decodeURIComponent(escape(atob(value.slice(ENCODED_PREFIX.length))));
  } catch {
    return value;
  }
}

export function isEncoded(value: string): boolean {
  return value?.startsWith(ENCODED_PREFIX) ?? false;
}
