import { redirect } from 'next/navigation';

import pathsConfig from '~/config/paths.config';

// PropOps has no public marketing site.
// Authenticated users → /home (middleware handles the routing).
// Unauthenticated users → middleware redirects to sign-in.
export default function Home() {
  redirect(pathsConfig.app.home);
}
