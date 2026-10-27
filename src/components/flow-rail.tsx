export function FlowRail({
  steps,
  current,
}: {
  steps: { title: string; detail: string }[];
  current: number;
}) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => {
        const done = index < current;
        const now = index === current;
        return (
          <li
            key={step.title}
            className={`rounded-2xl border p-4 ${
              now
                ? "border-[#006699] bg-[#e6f3fa]"
                : done
                  ? "border-[#b7d4e4] bg-white"
                  : "border-[#d5e4ee] bg-white/70"
            }`}
          >
            <span
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${
                now || done ? "bg-[#006699] text-white" : "bg-[#e6f3fa] text-[#006699]"
              }`}
            >
              {done ? "✓" : index + 1}
            </span>
            <p className="mt-3 font-medium">{step.title}</p>
            <p className="mt-1 text-sm leading-5 text-[#667085]">{step.detail}</p>
          </li>
        );
      })}
    </ol>
  );
}
