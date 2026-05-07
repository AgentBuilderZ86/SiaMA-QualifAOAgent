import type { ReactNode } from "react";
import Link from "next/link";

export type SideRailItem = {
  label: ReactNode;
  href?: string;
  count?: number | string;
  active?: boolean;
};

export type SideRailGroup = {
  title?: string;
  items: SideRailItem[];
  topSlot?: ReactNode;
};

export function SideRail({ groups, topSlot }: { groups: SideRailGroup[]; topSlot?: ReactNode }) {
  return (
    <aside className="side">
      {topSlot}
      {groups.map((group, idx) => (
        <div key={`${group.title ?? "group"}-${idx}`}>
          {group.title ? <div className="grp">{group.title}</div> : null}
          {group.items.map((item, itemIdx) => {
            const className = `item${item.active ? " active" : ""}`;
            const content = (
              <>
                <span>{item.label}</span>
                {item.count !== undefined ? <span className="count">{item.count}</span> : null}
              </>
            );
            if (item.href) {
              return (
                <Link key={itemIdx} className={className} href={item.href}>
                  {content}
                </Link>
              );
            }
            return (
              <div key={itemIdx} className={className}>
                {content}
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
