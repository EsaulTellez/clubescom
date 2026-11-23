export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Cargando contenido"
      className="space-y-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden bg-[#155775]/15"
      >
        <div className="escom-top-progress h-full w-2/5 bg-[#155775]" />
      </div>

      <div className="rounded-sm border border-[#d0cec2] border-t-[3px] border-t-[#284956] bg-[#fffdf7] p-5 sm:p-6">
        <div className="h-3 w-28 animate-pulse rounded-sm bg-[#e5e2d7]" />
        <div className="mt-3 h-8 w-2/5 max-w-sm animate-pulse rounded-sm bg-[#dcd9ce]" />
        <div className="mt-3 h-4 w-3/5 max-w-lg animate-pulse rounded-sm bg-[#ece9df]" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="space-y-3 rounded-sm border border-[#d0cec2] bg-[#fffdf7] p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="h-3 w-20 animate-pulse rounded-sm bg-[#e5e2d7]" />
              <div className="h-3 w-14 animate-pulse rounded-sm bg-[#ece9df]" />
            </div>
            <div className="h-5 w-4/5 animate-pulse rounded-sm bg-[#dcd9ce]" />
            <div className="space-y-2 pt-1">
              <div className="h-3.5 w-full animate-pulse rounded-sm bg-[#ece9df]" />
              <div className="h-3.5 w-5/6 animate-pulse rounded-sm bg-[#ece9df]" />
            </div>
            <div className="pt-2">
              <div className="h-8 w-28 animate-pulse rounded-sm bg-[#e5e2d7]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
