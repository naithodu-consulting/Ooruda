import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';

export default function Loading() {
  return (
    <PageBody>
      <div className="mt-2 flex flex-col gap-4">
        <Skeleton className="h-5 w-44" />
        <div className="bg-card flex flex-wrap gap-6 rounded-xl border px-4 py-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="bg-card flex flex-col overflow-hidden rounded-xl border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b px-4 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </PageBody>
  );
}
