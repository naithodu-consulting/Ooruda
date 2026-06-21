'use client';

import { UpdateTeamAccountNameForm } from '@kit/team-accounts/components';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kit/ui/card';

export function AssociationNameCard({
  account,
  path,
}: {
  account: { id: string; name: string; slug: string };
  path: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Association Name</CardTitle>
        <CardDescription>
          The display name shown on bills and member portals.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <UpdateTeamAccountNameForm account={account} path={path} />
      </CardContent>
    </Card>
  );
}
