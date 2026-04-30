import { processDataStream } from 'ai';

export interface AIStreamChunk {
  text: string;
  done: boolean;
}

export async function readAITextStream(
  body: ReadableStream<Uint8Array>,
  onChunk?: (chunk: AIStreamChunk) => void
): Promise<string> {
  let fullText = '';

  await processDataStream({
    stream: body,
    onTextPart: async (text) => {
      fullText += text;
      onChunk?.({ text, done: false });
    },
    onErrorPart: async (error) => {
      throw new Error(error);
    },
  });

  onChunk?.({ text: '', done: true });
  return fullText;
}
