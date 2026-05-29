import * as React from 'react'
import { cn } from '../../../lib/utils'

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[60px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = 'Textarea'

export { Textarea }
