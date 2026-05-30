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
          const movementCount = cashMovements.filter((movement) => movement.portfolio_id === portfolio.id).length;
          return (
            <article key={portfolio.id} className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-bold">{portfolio.name}</h3>
                  <p className="mt-1 text-xs text-ink/50">{movementCount} 筆資金異動</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className={
                      "rounded-md px-3 py-2 text-sm " +
                      (selectedPortfolioId === portfolio.id
                        ? "border border-mint/20 bg-mint/10 font-semibold text-mint"
                        : "border border-ink/10 bg-white")
                    }
                    onClick={() => onSelectDefault(portfolio.id)}
                  >
                    {selectedPortfolioId === portfolio.id ? "預設帳本" : "設為預設"}
                  </button>
                  <button className="rounded-md border border-ink/10 px-3 py-2 text-sm" onClick={() => onCash(portfolio.id)}>
                    資金異動
                  </button>
                  <button className="rounded-md border border-ink/10 px-3 py-2 text-sm" onClick={() => onRename(portfolio)}>
                    重新命名
                  </button>
                  <button className="rounded-md border border-coral/20 px-3 py-2 text-sm text-coral" onClick={() => onDelete(portfolio)}>
                    刪除
                  </button>
                </div>
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
            </article>
          );
        })}
      </ListSection>
    </div>
  );
}
