'use client';

import * as React from 'react';
import { CodeBlock } from './CodeBlock';

interface MarkdownProps {
  children: string;
}

function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  // Collect code block content
  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim() || 'typescript';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      const code = codeLines.join('\n');
      const filename = extractFilenameFromCode(code) || undefined;

      elements.push(
        <CodeBlock
          key={key++}
          code={code}
          language={lang === 'ts' ? 'typescript' : lang === 'js' ? 'javascript' : lang}
          filename={filename}
          maxHeight="400px"
        />
      );
      i++; // skip closing ```
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2].trim();
      const textClass = level === 1 ? 'text-xl' : level === 2 ? 'text-lg' : level === 3 ? 'text-base' : 'text-sm';
      elements.push(
        <div key={key++} className={`${textClass} font-semibold text-[#1D2129] mt-4 mb-2`}>
          {inlineFormat(content)}
        </div>
      );
      i++;
      continue;
    }

    // List item
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.+)/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const marker = listMatch[2];
      const content = listMatch[3];
      const isOrdered = /^\d+$/.test(marker);

      const listItems: string[] = [];
      while (
        i < lines.length &&
        lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.+)/) &&
        lines[i].search(/\S/) >= indent
      ) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.+)/)!;
        listItems.push(m[3]);
        i++;
      }
      elements.push(
        <ul key={key++} className="list-disc list-inside space-y-1 my-2 ml-4 text-sm text-[#64748B]">
          {listItems.map((item, idx) => (
            <li key={idx}>{inlineFormat(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}$/)) {
      elements.push(<hr key={key++} className="border-[#E5E6EB] my-3" />);
      i++;
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith('#') &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].match(/^(\s*)([-*+]|\d+\.)\s+/) &&
      !lines[i].match(/^[-*_]{3,}$/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <p key={key++} className="text-sm text-[#64748B] leading-relaxed my-2">
          {inlineFormat(paraLines.join(' '))}
        </p>
      );
    }
  }

  return elements;
}

function inlineFormat(text: string): React.ReactNode {
  // Process inline code, bold, italic
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    // Inline code: `code`
    const codeMatch = remaining.match(/^([^`]*?)`([^`]+)`([\s\S]*)$/);
    if (codeMatch) {
      if (codeMatch[1]) parts.push(codeMatch[1]);
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 rounded bg-[#F5F7FA] text-[#165DFF] font-mono text-xs">
          {codeMatch[2]}
        </code>
      );
      remaining = codeMatch[3];
      continue;
    }

    // Bold: **text**
    const boldMatch = remaining.match(/^([^*]*?)\*\*([^*]+)\*\*([\s\S]*)$/);
    if (boldMatch) {
      if (boldMatch[1]) parts.push(boldMatch[1]);
      parts.push(<strong key={key++} className="font-semibold">{boldMatch[2]}</strong>);
      remaining = boldMatch[3];
      continue;
    }

    // Italic: *text*
    const italicMatch = remaining.match(/^([^*]*?)\*([^*]+)\*([\s\S]*)$/);
    if (italicMatch) {
      if (italicMatch[1]) parts.push(italicMatch[1]);
      parts.push(<em key={key++} className="italic">{italicMatch[2]}</em>);
      remaining = italicMatch[3];
      continue;
    }

    // No more patterns
    parts.push(remaining);
    break;
  }

  return <>{parts}</>;
}

function extractFilenameFromCode(code: string): string | null {
  const firstLine = code.split('\n')[0];
  const match = firstLine.match(/filename[:\s]*["']?([^"'\n]+)["']?/i);
  if (match) return match[1];
  const commentMatch = firstLine.match(/filename[:\s]*([^\s]+)/);
  if (commentMatch) return commentMatch[1];
  return null;
}

export function MarkdownRenderer({ children }: MarkdownProps) {
  return <div className="markdown-renderer space-y-1">{parseMarkdown(children)}</div>;
}
