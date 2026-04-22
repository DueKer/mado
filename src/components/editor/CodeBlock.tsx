'use client';

import * as React from 'react';
import CodeMirror, { basicSetup } from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  dark?: boolean;
  showLineNumbers?: boolean;
  maxHeight?: string;
  title?: string;
}

// Custom highlight style for TypeScript/JavaScript
const tsHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: '#C678DD' },
    { tag: tags.controlKeyword, color: '#C678DD' },
    { tag: tags.operatorKeyword, color: '#C678DD' },
    { tag: tags.definitionKeyword, color: '#C678DD' },
    { tag: tags.modifier, color: '#C678DD' },
    { tag: tags.string, color: '#98C379' },
    { tag: tags.number, color: '#D19A66' },
    { tag: tags.bool, color: '#D19A66' },
    { tag: tags.null, color: '#D19A66' },
    { tag: tags.comment, color: '#5C6370', fontStyle: 'italic' },
    { tag: tags.lineComment, color: '#5C6370', fontStyle: 'italic' },
    { tag: tags.blockComment, color: '#5C6370', fontStyle: 'italic' },
    { tag: tags.function(tags.variableName), color: '#61AFEF' },
    { tag: tags.function(tags.propertyName), color: '#61AFEF' },
    { tag: tags.definition(tags.variableName), color: '#E5C07B' },
    { tag: tags.propertyName, color: '#E06C75' },
    { tag: tags.variableName, color: '#E06C75' },
    { tag: tags.typeName, color: '#E5C07B' },
    { tag: tags.className, color: '#E5C07B' },
    { tag: tags.self, color: '#E5C07B' },
    { tag: tags.operator, color: '#56B6C2' },
    { tag: tags.punctuation, color: '#ABB2BF' },
    { tag: tags.bracket, color: '#ABB2BF' },
    { tag: tags.angleBracket, color: '#ABB2BF' },
    { tag: tags.squareBracket, color: '#ABB2BF' },
    { tag: tags.paren, color: '#ABB2BF' },
    { tag: tags.attributeName, color: '#D19A66' },
    { tag: tags.attributeValue, color: '#98C379' },
    { tag: tags.tagName, color: '#E06C75' },
  ])
);

// Plain background theme
const plainTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent' },
  '.cm-content': { caretColor: '#165DFF' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { color: '#86909C', minWidth: '2.5em' },
  '&.cm-focused .cm-cursor': { borderLeftColor: '#165DFF' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#165DFF20' },
}, { dark: false });

const plainDarkTheme = EditorView.theme({
  '&': { backgroundColor: '#1a1b26' },
  '.cm-content': { caretColor: '#7AA2F7' },
  '.cm-gutters': { backgroundColor: '#1a1b26', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { color: '#565F89', minWidth: '2.5em' },
  '&.cm-focused .cm-cursor': { borderLeftColor: '#7AA2F7' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#7AA2F740' },
}, { dark: true });

export function CodeBlock({
  code,
  language = 'typescript',
  filename,
  dark = false,
  showLineNumbers = true,
  maxHeight,
  title,
}: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-lg border border-[#E5E6EB] bg-white overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-[#F5F7FA] border-b border-[#E5E6EB]">
        <div className="flex items-center gap-2">
          {filename && (
            <span className="text-xs font-mono text-[#86909C]">{filename}</span>
          )}
          {title && !filename && (
            <span className="text-xs text-[#86909C]">{title}</span>
          )}
          <span className="text-xs text-[#86909C] bg-[#E5E6EB] px-1.5 py-0.5 rounded">
            {language}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-[#86909C] hover:text-[#1D2129] p-1 transition-colors"
          >
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-[#86909C] hover:text-[#165DFF] p-1 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div
          style={maxHeight ? { maxHeight } : undefined}
          className={cn('overflow-auto', dark ? 'bg-[#1a1b26]' : 'bg-white')}
        >
          <CodeMirror
            value={code}
            height="auto"
            extensions={[
              basicSetup({ lineNumbers: showLineNumbers }),
              tsHighlight,
              dark ? plainDarkTheme : plainTheme,
            ]}
            theme={undefined}
            editable={false}
            basicSetup={false}
            className={cn('text-sm [&_.cm-editor]:!bg-transparent [&_.cm-editor]:!p-0', dark ? 'dark' : '')}
          />
        </div>
      )}
    </div>
  );
}
