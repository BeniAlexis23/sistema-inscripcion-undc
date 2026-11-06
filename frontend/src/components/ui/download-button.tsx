import { Button, type ButtonProps } from './button';
import { cn } from '../../lib/utils';

export function DownloadButton({ className, asChild, ...props }: Omit<ButtonProps, 'variant' | 'size'>) {
  return <Button type={asChild ? undefined : 'button'} asChild={asChild} {...props} variant="default" size="default" className={cn('h-auto min-h-10 whitespace-normal px-4 py-2 text-left leading-5 [&_svg]:shrink-0', className)}/>;
}
