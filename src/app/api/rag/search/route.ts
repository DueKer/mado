import { NextResponse } from 'next/server';
import { buildContextWindow, type RagMiddlewareConfig } from '@/lib/rag/rag-middleware';
import { loadRagDocumentsFromDb } from '@/lib/rag/server';

interface SearchRequest {
  query?: string;
  agentId?: string;
  topK?: number;
  maxTokensPerSlice?: number;
  enableBM25?: boolean;
  enableAgentAwareness?: boolean;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as SearchRequest;
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const documents = await loadRagDocumentsFromDb();
    const config: RagMiddlewareConfig = {
      topK: body.topK,
      maxTokensPerSlice: body.maxTokensPerSlice,
      enableBM25: body.enableBM25,
      enableAgentAwareness: body.enableAgentAwareness,
    };
    const context = buildContextWindow(documents, query, body.agentId ?? 'generator', config);

    return NextResponse.json({
      query,
      documents: context.documents,
      totalTokens: context.totalTokens,
      summary: context.summary,
      corpus: {
        documents: documents.length,
        slices: documents.reduce((sum, doc) => sum + doc.slices.length, 0),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
