import type { RagSlice } from '@/types';

export function createSlices(content: string, docId: string): RagSlice[] {
  const slices: RagSlice[] = [];
  const lines = content.split('\n');
  let currentSlice = '';
  let sliceIndex = 0;

  for (const line of lines) {
    // 代码块、标题、类型声明作为自然切分点。
    const trimmed = line.trim();
    const isCodeBlock = trimmed.startsWith('```') || trimmed.startsWith('import ') || trimmed.startsWith('export ');
    const isHeading = /^#+\s/.test(trimmed) || /^interface\s/.test(trimmed) || /^type\s/.test(trimmed);
    const isLong = currentSlice.length > 500;

    if ((isCodeBlock || isHeading || isLong) && currentSlice.trim()) {
      slices.push({
        id: `${docId}_${sliceIndex}`,
        docId,
        content: currentSlice.trim(),
        keywords: extractSliceKeywords(currentSlice),
        index: sliceIndex,
      });
      sliceIndex++;
      currentSlice = '';
    }
    currentSlice += line + '\n';
  }

  if (currentSlice.trim()) {
    slices.push({
      id: `${docId}_${sliceIndex}`,
      docId,
      content: currentSlice.trim(),
      keywords: extractSliceKeywords(currentSlice),
      index: sliceIndex,
    });
  }

  return slices;
}

export function extractSliceKeywords(text: string): string[] {
  const stopWords = new Set(['的', '了', '和', '是', '在', '我', '这', '不', 'the', 'a', 'an', 'is', 'are']);
  return text
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .slice(0, 10);
}
