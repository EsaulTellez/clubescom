const tones: Record<string, string> = {
  academico: "from-[#00324d] via-[#006699] to-[#4aa3c7]",
  social: "from-[#002433] via-[#006699] to-[#7eb8d4]",
  tramites: "from-[#01425f] via-[#0a7eaa] to-[#9fd0e6]",
  cultural: "from-[#01293b] via-[#006699] to-[#5aafd0]",
  deportivo: "from-[#001e2e] via-[#005580] to-[#8ec6dc]",
  club: "from-[#003049] via-[#006699] to-[#6eb6d2]",
  perdido: "from-[#3a2208] via-[#8a5a12] to-[#e6c27a]",
  encontrado: "from-[#013047] via-[#006699] to-[#9fd0e6]",
  gestion_escolar: "from-[#00324d] via-[#006699] to-[#4aa3c7]",
  becas: "from-[#01425f] via-[#0a7eaa] to-[#9fd0e6]",
  catt: "from-[#01293b] via-[#006699] to-[#5aafd0]",
  general: "from-[#001e2e] via-[#005580] to-[#8ec6dc]",
};

const art: Record<string, string> = {
  academico: "/ejemplos/academico.svg",
  social: "/ejemplos/social.svg",
  tramites: "/ejemplos/tramites.svg",
  cultural: "/ejemplos/cultural.svg",
  deportivo: "/ejemplos/deportivo.svg",
  club: "/ejemplos/club.svg",
  perdido: "/ejemplos/perdido.svg",
  encontrado: "/ejemplos/encontrado.svg",
  gestion_escolar: "/ejemplos/tramites.svg",
  becas: "/ejemplos/becas.svg",
  catt: "/ejemplos/catt.svg",
  general: "/ejemplos/general.svg",
};

export function coverTone(kind: string) {
  if (kind in tones) return kind;
  return "club";
}

export function Cover({
  tone,
  title,
  kicker,
  image,
  className = "",
}: {
  tone: string;
  title?: string;
  kicker?: string;
  image?: string | null;
  className?: string;
}) {
  const wash = tones[coverTone(tone)] ?? tones.club;
  const src = image || art[coverTone(tone)] || art.club;
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${wash} ${className}`}>
      <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <img
        src="/brand/escudo-escom.png"
        alt=""
        className="pointer-events-none absolute right-4 top-4 h-12 w-auto drop-shadow-[0_8px_16px_rgba(0,24,40,0.35)] brightness-0 invert"
      />
      <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[#001820]/75 to-transparent" />
      {(kicker || title) && (
        <div className="absolute inset-x-0 bottom-0 p-4 pr-6 text-white">
          {kicker && (
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/75">{kicker}</p>
          )}
          {title && <p className="mt-1 max-w-[16rem] font-serif text-[1.15rem] leading-snug tracking-tight">{title}</p>}
        </div>
      )}
    </div>
  );
}
