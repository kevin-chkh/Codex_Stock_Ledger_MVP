import { currency } from "@/lib/format";
import type { CashMovement, CashMovementType, Portfolio } from "@/lib/types";
import { ListSection, Row } from "./ui";

export function Portfolios({
  portfolios,
  cashMovements,
  onNew,
  onCash
}: {
  portfolios: Portfolio[];
  cashMovements: CashMovement[];
  onNew: () => void;
  onCash: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <button className="rounded-lg bg-mint px-4 py-3 font-semibold text-white" onClick={onNew}>
          新增帳本
        </button>
        <button className="rounded-lg bg-ink px-4 py-3 font-semibold text-white" onClick={onCash}>
          資金異動
        </button>
      </div>
      <ListSection title="帳本" empty="尚無帳本">
        {portfolios.map((portfolio) => (
          <Row
            key={portfolio.id}
            title={portfolio.name}
            subtitle={"投入 " + currency(portfolio.total_deposits) + " · 轉出 " + currency(portfolio.total_withdrawals)}
            right={currency(portfolio.cash_balance)}
          />
        ))}
      </ListSection>
      <ListSection title="資金異動紀錄" empty="尚無資金異動">
        {cashMovements.slice(0, 8).map((movement) => (
          <Row key={movement.id} title={movementTypeLabel(movement.type)} subtitle={movement.occurred_at + " · 餘額 " + currency(movement.balance_after)} right={currency(movement.amount)} />
        ))}
      </ListSection>
    </div>
  );
}

function movementTypeLabel(type: CashMovementType) {
  if (type === "deposit") return "加入金額";
  if (type === "withdraw") return "轉出金額";
  return "金額修正";
}
