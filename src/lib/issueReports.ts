/**
 * Local issue-report store. When the app crashes, the error screen offers a
 * one-tap "Report this issue". Reports are saved in the browser and listed
 * under Settings → Reports so the user can screenshot and share them.
 */
export type IssueReport = {
  id: string;
  createdAt: string; // ISO timestamp
  page: string;
  friendly: string;
  detail: string;
};

const KEY = "zen.issueReports";
const MAX = 50;

/** Translate a technical error into plain language a non-technical user understands. */
export function friendlyErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
  const m = raw.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed") || m.includes("network request failed"))
    return "The app couldn't reach the internet or its server. Check your connection and try again in a moment.";
  if (m.includes("quota"))
    return "The video search service has reached its daily limit. It resets automatically — try again later, or add your own free API key in Settings.";
  if (m.includes("unauthorized") || m.includes("401") || m.includes("jwt") || m.includes("refresh token"))
    return "Your sign-in session expired or couldn't be verified. Signing in again usually fixes this.";
  if (m.includes("timeout") || m.includes("timed out"))
    return "The request took too long to answer. This is usually temporary — please try again.";
  if (m.includes("not found") || m.includes("404"))
    return "The page or video you were looking for couldn't be found. It may have been moved or removed.";
  if (m.includes("chunk") || m.includes("dynamically imported module") || m.includes("importing a module script failed"))
    return "A newer version of the app was just released and your browser still had old files. Refreshing the page fixes this.";
  return "Something unexpected broke inside the app while showing this page. Refreshing usually fixes it — if it keeps happening, please report it.";
}

export function getIssueReports(): IssueReport[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as IssueReport[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persist(list: IssueReport[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage may be unavailable in private modes */
  }
}

export function saveIssueReport(error: unknown, page: string): IssueReport | null {
  if (typeof window === "undefined") return null;
  const detail =
    error instanceof Error
      ? [`${error.name}: ${error.message}`, (error.stack || "").split("\n").slice(1, 6).join("\n")]
          .filter(Boolean)
          .join("\n")
      : String(error ?? "Unknown error");
  const report: IssueReport = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    page: page || window.location.pathname,
    friendly: friendlyErrorMessage(error),
    detail,
  };
  persist([report, ...getIssueReports()]);
  return report;
}

export function deleteIssueReport(id: string) {
  persist(getIssueReports().filter((r) => r.id !== id));
}

export function clearIssueReports() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
