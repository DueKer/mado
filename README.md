# Mado - AI Agent Platform

A modern AI agent platform built with Next.js, featuring AI streaming chat, agent management, RAG knowledge base, and task history.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, Tailwind CSS v4, Radix UI
- **AI**: Vercel AI SDK, Anthropic, OpenAI
- **Database**: Drizzle ORM with libSQL (Turso-compatible)
- **Language**: TypeScript

## Features

- Real-time AI streaming chat
- Agent creation and management
- RAG knowledge base with vector search
- Task history tracking
- Code execution with syntax highlighting
- Settings and help documentation

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env.local
# Edit .env.local with your API keys
```

3. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Database Commands

```bash
npm run db:generate  # Generate Drizzle migrations
npm run db:migrate   # Run migrations
npm run db:push      # Push schema to database
npm run db:studio    # Open Drizzle Studio
```

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   ├── api/          # API routes
│   ├── agent-manage/ # Agent management page
│   ├── history-task/# Task history page
│   ├── rag-knowledge/# RAG knowledge base
│   └── setting-help/ # Settings & help page
├── hooks/            # Custom React hooks
└── lib/              # Utility functions and constants
```

## License

MIT
