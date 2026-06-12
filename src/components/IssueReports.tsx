import { useEffect, useState } from "react";
import { Bug, Camera, Trash2 } from "lucide-react";
import {
  getIssueReports, deleteIssueReport, clearIssueReports, type IssueReport,
} from "@/lib/issueReports";

/** Settings → Reports tab: lists crash/issue reports saved on this device. */
export function ReportsSection() {
  const [reports, setReports] = useState<IssueReport[]>([]);

  useEffect(() => {
    setReports(getIssueReports());
  }, []);

  const remove = (id: string) => {
    deleteIssueReport(id);
    setReports(getIssueReports());
  };

  const clearAll = () => {
    clearIssueReports();
    setReports([]);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Bug className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Issue reports</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Problems you reported from error screens are saved here on this device.
            </p>
          </div>
        </div>
        {reports.length > 0 && (
          <button
            onClick={clearAll}
            className="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-surface/60 p-3 text-xs text-muted-foreground">
        <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          To send a report to the developer, open it below and take a photo or
          screenshot of the whole card — it contains everything needed to fix the bug.
        </span>
      </div>

      {reports.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No reports yet — that's a good sign. If the app ever shows an error
          screen, tap "Report this issue" and it will appear here.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {reports.map((r) => (
            <article key={r.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString()} · Page: <span className="text-foreground">{r.page || "/"}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-foreground">{r.friendly}</p>
                  {r.reproSteps && (
                    <div className="mt-2 rounded-md border border-border/60 bg-surface/60 p-2.5 text-xs leading-relaxed text-foreground">
                      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Steps to reproduce</div>
                      <div className="whitespace-pre-wrap">{r.reproSteps}</div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => remove(r.id)}
                  aria-label="Delete report"
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Technical details (for the developer)
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {r.detail}
                  {r.device ? `\n\n--- Device ---\n${r.device}` : ""}
                </pre>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
