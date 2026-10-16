import { card } from "@/lib/ui";

export default function AvisoPage() {
  return (
    <article className={`${card} max-w-3xl space-y-3`}>
      <h1 className="text-xl font-semibold">Aviso de privacidad</h1>
      <p>
        La ESCOM, como unidad del Instituto Politécnico Nacional, recaba nombre, boleta o número de empleado y correo institucional para autenticar a la comunidad y enviar avisos académicos.
      </p>
      <p>
        Esos datos no se usan para otro fin. Puedes descargar tu información o eliminar tu cuenta desde el perfil. Las contraseñas se guardan con bcrypt y la sesión expira a las 8 horas.
      </p>
    </article>
  );
}
