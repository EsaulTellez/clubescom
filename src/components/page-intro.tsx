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
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#006699]">{kicker}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#1b4053] sm:text-4xl">{title}</h1>
        {text && <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[#5f6e78]">{text}</p>}
      </div>
      {action}
    </div>
  );
}
