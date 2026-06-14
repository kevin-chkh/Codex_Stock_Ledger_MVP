import type { CashMovement, Portfolio } from "@/lib/types";
import { currency } from "@/lib/format";
import { ListSection } from "./ui";

export function Portfolios({
  portfolios,
  cashMovements,
  selectedPortfolioId,
  onNew,
  onCash,
  onRename,
  onDelete,
  onSelectDefault
}: {
  portfolios: Portfolio[];
  cashMovements: CashMovement[];
  selectedPortfolioId: string;
  onNew: () => void;
  onCash: (portfolioId: string) => void;
  onRename: (portfolio: Portfolio) => void;
  onDelete: (portfolio: Portfolio) => void;
  onSelectDefault: (portfolioId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <section>
        <button className="w-full rounded-lg bg-ink px-4 py-4 text-left font-semibold text-white shadow-soft" onClick={onNew}>
          新增帳本
        </button>
      </section>
      <ListSection title={`帳本 ${portfolios.length} 本`} empty="尚無帳本">
        {portfolios.map((portfolio) => {
          const portfolioMovements = cashMovements
            .filter((movement) => movement.portfolio_id === portfolio.id)
            .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
          const movementCount = portfolioMovements.length;
          const isDefault = selectedPortfolioId === portfolio.id;
          return (
            <article key={portfolio.id} className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-bold">{portfolio.name}</h3>
                    {isDefault ? <span className="rounded-full border border-mint/20 bg-mint/10 px-2.5 py-1 text-[11px] font-semibold text-mint">預設帳本</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-ink/50">{movementCount} 筆資金異動</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {!isDefault ? (
                  <button className="rounded-full border border-mint/20 bg-mint/10 px-3 py-2 text-xs font-semibold text-mint" onClick={() => onSelectDefault(portfolio.id)}>
                    設為預設
                  </button>
                ) : null}
                <button className="rounded-full border border-mint/20 bg-mint/10 px-3 py-2 text-xs font-semibold text-mint" onClick={() => onCash(portfolio.id)}>
                  資金異動
                </button>
                <button className="rounded-full border border-ink/10 bg-white px-3 py-2 text-xs font-semibold text-ink/70" onClick={() => onRename(portfolio)}>
                  重新命名
                </button>
                <button className="rounded-full border border-coral/20 bg-coral/5 px-3 py-2 text-xs font-semibold text-coral" onClick={() => onDelete(portfolio)}>
                  刪除
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-paper p-3">
                  <p className="text-xs text-ink/55">現金餘額</p>
                  <p className="mt-1 font-bold">{currency(portfolio.cash_balance)}</p>
                </div>
                <div className="rounded-md bg-paper p-3">
                  <p className="text-xs text-ink/55">累計投入</p>
                  <p className="mt-1 font-bold">{currency(portfolio.total_deposits)}</p>
                </div>
                <div className="rounded-md bg-paper p-3">
                  <p className="text-xs text-ink/55">累計轉出</p>
                  <p className="mt-1 font-bold">{currency(portfolio.total_withdrawals)}</p>
                </div>
                <div className="rounded-md bg-paper p-3">
                  <p className="text-xs text-ink/55">初始金額</p>
                  <p className="mt-1 font-bold">{currency(portfolio.initial_amount)}</p>
                </div>
              </div>
              {portfolioMovements.length > 0 ? (
                <div className="mt-4 rounded-lg border border-ink/10 bg-paper/45 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">資金異動紀錄</p>
                    <p className="text-xs text-ink/45">最近 {Math.min(3, portfolioMovements.length)} 筆</p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {portfolioMovements.slice(0, 3).map((movement) => (
                      <div key={movement.id} className="rounded-md bg-white px-3 py-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold">{movementTypeLabel(movement.type)}</p>
                            <p className="mt-1 text-xs text-ink/45">{movement.occurred_at}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={"font-bold " + movementToneClass(movement.type)}>
                              {movementAmountPrefix(movement.type)}
                              {currency(movement.amount)}
                            </p>
                            <p className="mt-1 text-xs text-ink/45">餘額 {currency(movement.balance_after)}</p>
                          </div>
                        </div>
                        {movement.note ? <p className="mt-2 break-words rounded-md bg-paper px-2 py-1.5 text-xs text-ink/65">{movement.note}</p> : null}
                      </div>
                    ))}
                  </div>
                  {portfolioMovements.length > 3 ? (
                    <p className="mt-2 text-xs text-ink/45">另有 {portfolioMovements.length - 3} 筆較早紀錄。</p>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </ListSection>
    </div>
  );
}

function movementTypeLabel(type: CashMovement["type"]) {
  if (type === "deposit") return "加入金額";
  if (type === "withdraw") return "轉出金額";
  return "金額修正";
}

function movementAmountPrefix(type: CashMovement["type"]) {
  if (type === "deposit") return "+";
  if (type === "withdraw") return "-";
  return "";
}

function movementToneClass(type: CashMovement["type"]) {
  if (type === "deposit") return "text-coral";
  if (type === "withdraw") return "text-mint";
  return "text-ink";
}
