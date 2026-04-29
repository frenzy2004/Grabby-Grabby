import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

const variantClasses: Record<Variant, string> = {
  primary: 'bg-matcha text-cream hover:bg-matcha-deep active:bg-matcha-deep',
  secondary: 'bg-transparent text-ink border border-ink/80 hover:bg-ink/5',
  ghost: 'bg-transparent text-ink/60',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-full px-6 py-[18px]',
        'text-[15px] font-medium font-sans transition-all duration-200',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variantClasses[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
