import * as React from 'react'
import { cn } from '../../../lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-emerald-600 text-white hover:bg-emerald-700': variant === 'default',
            'border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700': variant === 'outline',
            'hover:bg-slate-100 dark:hover:bg-slate-700': variant === 'ghost',
            'bg-red-600 text-white hover:bg-red-700': variant === 'destructive',
          },
          {
            'h-9 px-4 py-2': size === 'default',
            'h-8 px-3 text-xs': size === 'sm',
            'h-10 px-6': size === 'lg',
            'h-9 w-9': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button }
