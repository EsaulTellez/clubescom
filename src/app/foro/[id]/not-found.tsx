import Link from "next/link";
import { card } from "@/lib/ui";

export default function QuestionNotFound() {
  return (
    <div className={`${card} mx-auto max-w-lg space-y-3`}>
      <h1 className="text-xl font-semibold">No encontramos esa pregunta</h1>
      <p className="text-sm text-[#667085]">
        Puede que se haya eliminado o que el enlace esté incompleto.
      </p>
      <Link href="/foro" className="text-sm font-medium text-[#006699] underline">
        Volver al foro
      </Link>
    </div>
  );
}
