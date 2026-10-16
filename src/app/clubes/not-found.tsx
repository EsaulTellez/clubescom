import Link from "next/link";
import { card } from "@/lib/ui";

export default function ClubesNotFound() {
  return (
    <div className={`${card} space-y-3`}>
      <h1 className="text-xl font-semibold">No encontramos ese club o esa propuesta</h1>
      <Link href="/clubes" className="text-sm text-[#006699] underline">
        Volver al directorio
      </Link>
    </div>
  );
}
