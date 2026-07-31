import { PageBody } from '@kit/ui/page';
import { Skeleton } from '@kit/ui/skeleton';

export default function Loading() {
  return (
    <PageBody>
      <div className="mt-2 flex flex-col gap-4">
        <Skeleton className="h-5 w-36" />
        <div className="bg-card overflow-hidden rounded-xl border">
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 w-[140px]" />
            <Skeleton className="h-8 w-[150px]" />
          </div>
          <div className="flex flex-col">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b px-4 py-3"
              >
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageBody>
  );
}
