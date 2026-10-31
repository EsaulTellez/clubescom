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
        <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#7869ec]">{kicker}</p>
        <h1 className="mt-1 font-serif text-4xl font-extrabold tracking-[-0.045em] text-[#222337] sm:text-5xl">{title}</h1>
        {text && <p className="mt-2 max-w-2xl text-[15px] leading-7 text-[#777c8d]">{text}</p>}
      </div>
      {action}
    </div>
  );
}
