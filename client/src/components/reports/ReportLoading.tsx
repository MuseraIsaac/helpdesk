interface ReportLoadingProps {
  kpiCount?: number;
  chartCount?: number;
}

export default function ReportLoading({ kpiCount = 4, chartCount = 2 }: ReportLoadingProps) {
  return (
    <div className="space-y-5 animate-pulse">
      {kpiCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: kpiCount }).map((_, i) => (
            <div key={i} className="flex items-stretch rounded-xl border border-border/50 overflow-hidden bg-card shadow-sm h-[92px]">
              <div className="w-1 bg-muted" />
              <div className="flex-1 px-4 py-3.5 space-y-2.5">
                <div className="h-2 w-20 bg-muted rounded-full" />
                <div className="h-7 w-14 bg-muted rounded" />
                <div className="h-2 w-24 bg-muted/60 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}
      {Array.from({ length: chartCount }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border border-border/60 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center gap-2.5">
            <div className="h-4 w-1 bg-muted rounded-full" />
            <div className="space-y-1.5">
              <div className="h-3 w-32 bg-muted rounded" />
              <div className="h-2 w-48 bg-muted/60 rounded" />
            </div>
          </div>
          <div className="p-5">
            <div className={i === 0 ? "h-52 bg-muted/40 rounded-lg" : "h-44 bg-muted/40 rounded-lg"} />
          </div>
        </div>
      ))}
    </div>
  );
}
