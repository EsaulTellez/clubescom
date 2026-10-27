export function PageIntro({
  kicker,
  title,
  text,
  action,
}: {
  kicker: string;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="text-sm text-[#006699]">{kicker}</p>
        <h1 className="mt-1 font-serif text-4xl tracking-tight">{title}</h1>
        {text && <p className="mt-2 text-sm leading-6 text-[#667085]">{text}</p>}
      </div>
      {action}
    </div>
  );
}
