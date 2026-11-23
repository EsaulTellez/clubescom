import Link from "next/link";
import { btnGhost, card } from "@/lib/ui";

export default function AvisoPage() {
  return (
    <article className={`${card} mx-auto max-w-3xl space-y-5`}>
      <header className="border-b border-[#dcd9ce] pb-4">
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#155775]">
          Plataforma comunitaria ESCOM
        </p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#173142]">
          Aviso de privacidad integral
        </h1>
      </header>

      <p className="text-sm leading-6 text-[#445660]">
        Esta plataforma es un proyecto académico y comunitario independiente dirigido a estudiantes, docentes y personal de la Escuela Superior de Cómputo (ESCOM). Recaba nombre completo, número de boleta o de empleado y correo electrónico institucional (<code>@alumno.ipn.mx</code> o <code>@ipn.mx</code>) con la finalidad exclusiva de autenticar a los integrantes de la comunidad, gestionar propuestas y membresías de clubes, orientar trámites escolares, facilitar la devolución de objetos perdidos y difundir avisos comunitarios.
      </p>
      <p className="text-sm leading-6 text-[#445660]">
        Los datos privados (correo institucional y boleta o número de empleado) se resguardan en almacenamiento privado con políticas de control de acceso por usuario autenticado y no se exponen públicamente ni se transfieren a terceros con fines comerciales. En el módulo de Objetos Perdidos, el correo institucional solo se comparte entre quien encontró el objeto y quien acreditó su propiedad mediante la pregunta llave y la aprobación del reclamo.
      </p>

      <section className="space-y-2 border-t border-[#dcd9ce] pt-4">
        <h2 className="text-lg font-bold text-[#173142]">Ejercicio de Derechos ARCO</h2>
        <p className="text-sm leading-6 text-[#445660]">
          En cualquier momento puedes ejercer tus derechos de <strong>Acceso, Rectificación, Cancelación y Oposición (ARCO)</strong> directamente desde tu cuenta:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-[#445660]">
          <li><strong>Acceso y portabilidad:</strong> descarga el expediente completo de tus datos en formato JSON o CSV desde tu perfil.</li>
          <li><strong>Rectificación:</strong> actualiza tu nombre o boleta directamente o registra una solicitud formal de rectificación.</li>
          <li><strong>Cancelación:</strong> elimina tu cuenta y los archivos asociados de forma inmediata, o solicita acompañamiento previo.</li>
          <li><strong>Oposición:</strong> configura las categorías de notificaciones in-app o registra una solicitud de oposición al tratamiento.</li>
        </ul>
      </section>

      <section className="space-y-3 border-t border-[#dcd9ce] pt-4">
        <h2 className="text-lg font-bold text-[#173142]">Contacto de privacidad y canal de incidentes</h2>
        <div className="rounded-sm border border-[#b7d4e4] border-l-4 border-l-[#155775] bg-[#f1f8fb] p-4 text-sm text-[#173142]">
          <p className="font-bold">Equipo responsable de la plataforma (Comunidad ESCOM)</p>
          <p className="mt-1 text-xs leading-5 text-[#425a66]">
            Proyecto independiente desarrollado para la comunidad estudiantil y docente de la ESCOM. No constituye una oficina ni canal oficial del Instituto Politécnico Nacional.
          </p>
          <p className="mt-2">
            Correo de contacto, dudas de privacidad y reporte de incidentes:{" "}
            <a
              href="mailto:ecomunidad.plataforma@gmail.com"
              className="font-bold text-[#005a87] underline underline-offset-2"
            >
              ecomunidad.plataforma@gmail.com
            </a>
          </p>
        </div>
        <p className="text-sm leading-6 text-[#445660]">
          Si detectas un incidente de seguridad, vulneración de datos personales o deseas seguimiento sobre una solicitud ARCO, puedes reportarlo desde el formulario en tu perfil o escribirnos directamente a{" "}
          <a href="mailto:ecomunidad.plataforma@gmail.com" className="font-semibold text-[#005a87] underline">
            ecomunidad.plataforma@gmail.com
          </a>
          .
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
