import { notFound, redirect } from "next/navigation";
import { isUuid } from "../shared";

export const dynamic = "force-dynamic";

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  redirect(`/foro?duda=${id}#duda-${id}`);
}
