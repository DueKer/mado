'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  color?: 'primary' | 'success' | 'warning' | 'error';
}

export function Progress({ className, value = 0, color = 'primary', ...props }: ProgressProps) {
  const colors = {
    primary: 'bg-[#165DFF]',
    success: 'bg-[#36D399]',
    warning: 'bg-[#FBBD23]',
    error: 'bg-[#F87272]',
  };

  return (
    <div className={cn('w-full h-1.5 rounded-full bg-[#F5F7FA] overflow-hidden', className)} {...props}>
      <div
        className={cn('h-full rounded-full transition-all duration-300', colors[color])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
