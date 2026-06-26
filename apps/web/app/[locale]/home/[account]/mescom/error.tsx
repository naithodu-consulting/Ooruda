'use client';

import { TriangleAlert } from 'lucide-react';

import { useCaptureException } from '@kit/monitoring/hooks';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { PageBody } from '@kit/ui/page';

export default function MescomErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useCaptureException(error.digest ? null : error);

  return (
    <PageBody>
      <div className="flex flex-col gap-4">
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription>
            {error.message || 'Unable to load data. Please try again.'}
          </AlertDescription>
        </Alert>

        <div>
          <Button variant="outline" onClick={reset}>
            Try again
          </Button>
        </div>
      </div>
    </PageBody>
  );
}
