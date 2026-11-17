import Link from "next/link";
import { btnGhost, card } from "@/lib/ui";

export default function AvisoPage() {
  return (
    <article className={`${card} mx-auto max-w-3xl space-y-4`}>
      <h1 className="text-2xl font-bold text-[#173142]">Aviso de privacidad integral</h1>
      <p className="text-sm leading-6 text-[#52596a]">
        La Escuela Superior de Cómputo (ESCOM), como unidad académica del Instituto Politécnico Nacional (IPN), recaba nombre completo, número de boleta o número de empleado y correo electrónico institucional (`@alumno.ipn.mx` o `@ipn.mx`) con la finalidad exclusiva de autenticar a los integrantes de la comunidad, gestionar propuestas y membresías de clubes, orientar trámites escolares, facilitar la devolución de objetos perdidos y difundir avisos institucionales.
      </p>
      <p className="text-sm leading-6 text-[#52596a]">
        Los datos privados (correo y boleta) se resguardan en un esquema protegido (`private.user_private`) con políticas de seguridad a nivel de fila (RLS) y no se exponen públicamente ni se transfieren a terceros ajenos al IPN. En el módulo de Objetos Perdidos, el correo institucional solo se comparte entre quien encontró el objeto y quien acreditó su propiedad mediante la pregunta de seguridad y la aprobación del reclamo.
      </p>

      <section className="space-y-2 border-t border-[#dcd9ce] pt-4">
        <h2 className="text-lg font-semibold text-[#173142]">Ejercicio de Derechos ARCO</h2>
        <p className="text-sm leading-6 text-[#52596a]">
          En cualquier momento puedes ejercer tus derechos de <strong>Acceso, Rectificación, Cancelación y Oposición (ARCO)</strong> directamente desde tu cuenta:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-[#52596a]">
          <li><strong>Acceso y portabilidad:</strong> descarga el expediente completo de tus datos en formato JSON o CSV desde tu perfil.</li>
          <li><strong>Rectificación:</strong> actualiza tu nombre o boleta directamente o registra una solicitud formal de rectificación.</li>
          <li><strong>Cancelación:</strong> elimina tu cuenta y los archivos asociados de forma inmediata, o solicita acompañamiento previo.</li>
          <li><strong>Oposición:</strong> configura las categorías de notificaciones in-app o registra una solicitud de oposición al tratamiento.</li>
        </ul>
      </section>

      <section className="space-y-2 border-t border-[#dcd9ce] pt-4">
        <h2 className="text-lg font-semibold text-[#173142]">Oficial de Privacidad y Canal de Incidentes</h2>
        <div className="rounded-xl border border-[#b7d4e4] bg-[#eaf5fa] p-4 text-sm text-[#173142]">
          <p><strong>Responsable / Oficial de Privacidad (Unidad de Enlace ESCOM - IPN):</strong></p>
          <p className="mt-1">Subdirección Administrativa y Enlace de Transparencia de la ESCOM</p>
          <p>Ubicación: Edificio de Gobierno, Planta Baja, Av. Juan de Dios Bátiz s/n, Zacatenco, GAM, CDMX.</p>
          <p>Correo de contacto y reporte de incidentes: <a href="mailto:privacidad.escom@ipn.mx" className="font-semibold text-[#006699] underline">privacidad.escom@ipn.mx</a></p>
        </div>
        <p className="text-sm leading-6 text-[#52596a]">
          Si detectas un incidente de seguridad o vulneración de datos personales, puedes reportarlo directamente desde el formulario de incidentes en tu perfil o al correo del Oficial de Privacidad.
        </p>
        <div className="pt-2">
          <Link href="/perfil" className={btnGhost}>
            Ir a mi perfil y módulo ARCO →
          </Link>
        </div>
      </section>
    </article>
  );
}
