import type { ReactNode } from "react";

type ActionSheetProps = {
  title: string;
  description?: string;
  tone?: "default" | "danger";
  children: ReactNode;
};

export function ActionSheet({ title, description, tone = "default", children }: ActionSheetProps) {
  return (
    <section className={tone === "danger" ? "action-sheet action-sheet--danger" : "action-sheet"}>
      <header className="action-sheet__header">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="action-sheet__body">{children}</div>
    </section>
  );
}
