import { redirect } from 'next/navigation';
export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tests/${encodeURIComponent(id)}/overview`);
}
