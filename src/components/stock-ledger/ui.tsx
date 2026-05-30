import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

export function Metric({ label, value, strong, className = "" }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div>
      <p className="text-xs text-white/60">{label}</p>
      <p className={"mt-1 " + (strong ? "text-xl font-bold" : "font-semibold") + " " + className}>{value}</p>
    </div>
  );
}

export function SmallCard({
  label,
  value,
  valueClass = "",
  hint,
  onClick
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink/45">{label}</p>
      <p className={"mt-2 text-lg font-bold leading-tight " + valueClass}>{value}</p>
      {hint ? <p className="mt-2 text-xs text-ink/45">{hint}</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button className="w-full rounded-lg border border-ink/10 bg-white p-4 text-left shadow-soft transition hover:border-mint/30" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">{content}</section>;
}

export function SmallMetric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-md bg-paper p-3">
      <p className="text-xs text-ink/55">{label}</p>
      <p className={"mt-1 font-bold " + className}>{value}</p>
    </div>
  );
}

export function ListSection({
  title,
  empty,
  action,
  children
}: {
  title: string;
  empty: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">{title}</h2>
        {action}
      </div>
      <div className="mt-3 space-y-3">{hasItems ? children : <p className="text-sm text-ink/55">{empty}</p>}</div>
    </section>
  );
}

export function Row({ title, subtitle, right, rightClass = "" }: { title: string; subtitle: string; right: string; rightClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink/5 pb-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate font-semibold">{title}</p>
        <p className="mt-1 truncate text-sm text-ink/55">{subtitle}</p>
      </div>
      <p className={"shrink-0 text-sm font-bold " + rightClass}>{right}</p>
    </div>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
  trailing
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  trailing?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <div className="relative mt-1">
        <input
          className={"w-full rounded-md border border-ink/15 py-3 outline-none focus:border-mint " + (trailing ? "pl-3 pr-11" : "px-3")}
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {trailing ? <div className="absolute inset-y-0 right-0 flex items-center pr-3">{trailing}</div> : null}
      </div>
    </label>
  );
}

export function InfoTip({ label, body }: { label: string; body: string[] }) {
  return (
    <details className="group relative inline-block">
      <summary aria-label={label} className="list-none cursor-pointer text-white/55 transition hover:text-white/80">
        <CircleHelp size={14} />
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-56 rounded-md border border-ink/10 bg-white p-3 text-left text-xs leading-5 text-ink shadow-soft">
        <p className="font-semibold text-ink">{label}</p>
        <div className="mt-2 space-y-1">
          {body.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </details>
  );
}

export function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[][] }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">帳本</span>
      <select className="mt-1 w-full rounded-md border border-ink/15 bg-white px-3 py-3 outline-none focus:border-mint" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">請選擇</option>
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Segmented({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[][] }) {
  return (
    <div className="grid rounded-md bg-paper p-1" style={{ gridTemplateColumns: "repeat(" + options.length + ", minmax(0, 1fr))" }}>
      {options.map(([optionValue, label]) => (
        <button key={optionValue} className={"rounded px-3 py-2 text-sm font-semibold " + (value === optionValue ? "bg-white text-mint shadow-sm" : "text-ink/60")} onClick={() => onChange(optionValue)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function SubmitButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="sticky bottom-0 w-full rounded-md bg-mint px-4 py-3 font-semibold text-white shadow-soft" onClick={onClick}>
      {children}
    </button>
  );
}

export function PortfolioScopePicker({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-2 text-sm shadow-soft">
      <span className="shrink-0 text-ink/55">{label}</span>
      <select className="min-w-0 bg-transparent pr-5 text-sm font-semibold outline-none" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  tone = "danger",
  onConfirm,
  onCancel
}: {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/35" onClick={onCancel}>
      <section className="mx-auto w-full max-w-2xl rounded-t-xl bg-white p-4 shadow-soft" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-ink/65">{body}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="rounded-md border border-ink/10 px-4 py-3 font-semibold text-ink" onClick={onCancel}>
            取消
          </button>
          <button
            className={
              "rounded-md px-4 py-3 font-semibold text-white " + (tone === "danger" ? "bg-coral" : "bg-mint")
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
