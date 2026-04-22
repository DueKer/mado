'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          'h-10 px-3 rounded-lg border text-sm text-[#1D2129] placeholder:text-[#86909C]',
          'bg-white border-[#E5E6EB] focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20',
          'transition-colors duration-150',
          error && 'border-[#F87272] focus:border-[#F87272] focus:ring-[#F87272]/20',
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'px-3 py-2 rounded-lg border text-sm text-[#1D2129] placeholder:text-[#86909C]',
          'bg-white border-[#E5E6EB] focus:outline-none focus:border-[#165DFF] focus:ring-1 focus:ring-[#165DFF]/20',
          'transition-colors duration-150 resize-none',
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';
