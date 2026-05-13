import { parseRefreshSourcesFlash } from "./refreshReturnPath";

type SP = Record<string, string | string[] | undefined>;

export function RefreshSourcesFlash({ searchParams }: { searchParams: SP }) {
  const flash = parseRefreshSourcesFlash(searchParams);
  if (!flash) return null;
  return (
    <div className="alert" role="alert" style={{ marginBottom: 16 }}>
      <strong>Rafraîchissement des sources</strong>
      <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
        {flash.message}
      </p>
    </div>
  );
}
