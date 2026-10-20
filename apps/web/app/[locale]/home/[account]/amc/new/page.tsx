import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ account: string }>;
}

export default async function NewAmcContractPage({ params }: Props) {
  const { account } = await params;
  redirect(`/home/${account}/amc`);
}
