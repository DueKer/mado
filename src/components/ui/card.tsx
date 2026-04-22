'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ className, hover = false, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-[#E5E6EB] bg-white shadow-sm',
        hover && 'transition-shadow duration-200 hover:shadow-md hover:border-[#165DFF]/30',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 py-3 border-b border-[#E5E6EB]', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('font-semibold text-[#1D2129] text-base', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}
