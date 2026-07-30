'use client';

import { TriangleAlert } from 'lucide-react';

import { useCaptureException } from '@kit/monitoring/hooks';
import { Alert, AlertDescription, AlertTitle } from '@kit/ui/alert';
import { Button } from '@kit/ui/button';
import { PageBody } from '@kit/ui/page';
import { Trans } from '@kit/ui/trans';

export default function AccountErrorPage({
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
          <AlertTitle>
            <Trans i18nKey="common.genericError" />
          </AlertTitle>
          <AlertDescription>
            <Trans i18nKey="common.genericErrorSubHeading" />
          </AlertDescription>
        </Alert>

        <div>
          <Button variant="outline" onClick={reset}>
            <Trans i18nKey="common.tryAgain" />
          </Button>
        </div>
      </div>
    </PageBody>
  );
}
