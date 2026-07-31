import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';

export default function Loading() {
  return (
    <PageBody>
      <div className="mt-2 flex flex-col gap-4">
        <Skeleton className="h-5 w-36" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="flex flex-col gap-3 rounded-xl border p-4">
          <Skeleton className="h-4 w-56" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </PageBody>
  );
}
