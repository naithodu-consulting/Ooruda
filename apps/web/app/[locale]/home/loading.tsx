import { Spinner } from '@kit/ui/spinner';

export default function Loading() {
  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-4">
      <span className="text-foreground text-2xl font-bold tracking-tight">
        ooruda
      </span>
      <Spinner className="text-muted-foreground h-5 w-5" />
    </div>
  );
}
