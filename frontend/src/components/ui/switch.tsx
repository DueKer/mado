'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils';

export function Switch({ className, ...props }: React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'w-9 h-5 rounded-full relative transition-colors duration-200',
        'data-[state=checked]:bg-[#165DFF] data-[state=unchecked]:bg-[#E5E6EB]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#165DFF]/30',
        'cursor-pointer',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200',
          'translate-x-0.5 data-[state=checked]:translate-x-[18px]'
        )}
      />
    </SwitchPrimitive.Root>
  );
}
