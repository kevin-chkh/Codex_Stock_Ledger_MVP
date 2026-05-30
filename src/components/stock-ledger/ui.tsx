import type { ReactNode } from "react";

export function Metric({ label, value, strong, className = "" }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div>
      <p className="text-xs text-white/60">{label}</p>
      <p className={"mt-1 " + (strong ? "text-xl font-bold" : "font-semibold") + " " + className}>{value}</p>
    </div>
  );
}

export function SmallCard({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink/45">{label}</p>
      <p className={"mt-2 text-lg font-bold leading-tight " + valueClass}>{value}</p>
    </section>
  );
}

export function SmallMetric({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-md bg-paper p-3">
      <p className="text-xs text-ink/55">{label}</p>
      <p className={"mt-1 font-bold " + className}>{value}</p>
    </div>
  );
}

export function ListSection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <h2 className="font-bold">{title}</h2>
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
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-ink/15 px-3 py-3 outline-none focus:border-mint"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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
