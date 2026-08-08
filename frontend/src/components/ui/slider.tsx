'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

export function Slider({ className, ...props }: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex items-center w-full h-5 cursor-pointer', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow rounded-full bg-[#F5F7FA]">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-[#165DFF]" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block w-4 h-4 rounded-full bg-white border-2 border-[#165DFF] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#165DFF]/30 transition-transform hover:scale-110" />
    </SliderPrimitive.Root>
  );
}
