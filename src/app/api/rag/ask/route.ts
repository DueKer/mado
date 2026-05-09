import { NextResponse } from 'next/server';
import type { CoreMessage } from 'ai';
import { buildContextWindow, type RagMiddlewareConfig } from '@/lib/rag/rag-middleware';
import { loadRagDocumentsFromDb } from '@/lib/rag/server';
import { generateServerAIText } from '@/lib/ai/server-service';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AskRequest {
  question?: string;
  history?: ChatMessage[];
  topK?: number;
  maxTokensPerSlice?: number;
  enableBM25?: boolean;
  enableAgentAwareness?: boolean;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as AskRequest;
    const question = body.question?.trim();

    if (!question) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    const documents = await loadRagDocumentsFromDb();
    const config: RagMiddlewareConfig = {
      topK: body.topK,
      maxTokensPerSlice: body.maxTokensPerSlice,
      enableBM25: body.enableBM25,
      enableAgentAwareness: body.enableAgentAwareness,
    };
    const context = buildContextWindow(documents, question, 'document', config);

    if (context.documents.length === 0) {
      return NextResponse.json({
        answer: '没有检索到相关知识库内容，无法基于私有知识回答。',
        sources: [],
        totalTokens: 0,
      });
    }

    const sourceText = context.documents
      .map((item, index) => `【来源${index + 1}】文档: ${item.doc.name}；切片: ${item.slice.index + 1}；分数: ${item.score.toFixed(2)}\n${item.slice.content}`)
      .join('\n\n');

    const historyMessages: CoreMessage[] = (body.history ?? [])
      .slice(-6)
      .map(item => ({
        role: item.role,
        content: item.content,
      }));

    const answer = await generateServerAIText({
      provider: 'openai',
      messages: [
        {
          role: 'system',
          content: [
            '你是私有知识库 RAG 问答助手。',
            '必须只基于【知识库来源】回答，不能编造未给出的事实。',
            '如果来源不足以回答，要明确说明缺少依据。',
            '回答中的关键结论必须使用 [来源1]、[来源2] 这样的编号引用。',
            '回答末尾输出“引用来源”列表，列出使用过的来源编号和文档名。',
          ].join('\n'),
        },
        ...historyMessages,
        {
          role: 'user',
          content: `【用户问题】\n${question}\n\n【知识库来源】\n${sourceText}`,
        },
      ],
      temperature: 0.1,
      maxTokens: 1800,
    });

    return NextResponse.json({
      answer,
      sources: context.documents,
      totalTokens: context.totalTokens,
      summary: context.summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
