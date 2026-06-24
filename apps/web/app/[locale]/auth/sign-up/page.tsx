import { redirect } from 'next/navigation';

import pathsConfig from '~/config/paths.config';

// Ooruda has no self-serve sign-up — users are added by association admins.
export default function SignUpPage() {
  redirect(pathsConfig.auth.signIn);
}
