'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      primary: 'bg-[#165DFF] text-white hover:bg-[#1250D6] active:scale-[0.98]',
      secondary: 'border border-[#E5E6EB] bg-white text-[#1D2129] hover:border-[#165DFF] hover:text-[#165DFF] active:scale-[0.98]',
      ghost: 'text-[#86909C] hover:text-[#1D2129] hover:bg-[#F5F7FA]',
      danger: 'bg-[#F87272] text-white hover:bg-[#E65050] active:scale-[0.98]',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-10 px-5 text-sm gap-2',
      lg: 'h-12 px-6 text-base gap-2',
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
