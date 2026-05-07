import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  sub,
  actions
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {actions ? <div className="h-actions">{actions}</div> : null}
    </div>
  );
}
