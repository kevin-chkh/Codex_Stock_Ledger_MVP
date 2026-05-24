import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useMemo, useState } from "react";
import { currency, percent, profitClass } from "@/lib/format";
import { groupByValue } from "@/lib/calculations";
import type { Position } from "@/lib/types";
import { ListSection, Row } from "./ui";

const colors = ["#2f7d68", "#c6973f", "#c75b4d", "#4f6f9f", "#7c6a9d", "#61705f"];

export function Analytics({ positions }: { positions: Position[] }) {
  const [tagFilter, setTagFilter] = useState("all");
  const openPositions = useMemo(() => positions.filter((position) => position.quantity > 0), [positions]);
  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    openPositions.forEach((position) => position.tags.forEach((tag) => tags.add(tag)));
    return [...tags].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [openPositions]);
  const filteredPositions = useMemo(
    () => (tagFilter === "all" ? openPositions : openPositions.filter((position) => position.tags.includes(tagFilter))),
    [openPositions, tagFilter]
  );
  const byIndustry = groupByValue(filteredPositions, (position) => position.industry, (position) => position.market_value);
  const byTag = groupByValue(
    filteredPositions.flatMap((position) => (position.tags.length ? position.tags.map((tag) => ({ tag, value: position.market_value })) : [{ tag: "未標籤", value: position.market_value }])),
    (item) => item.tag,
    (item) => item.value
  );
  const byStock = groupByValue(filteredPositions, (position) => position.symbol + " " + position.name, (position) => position.market_value);
  const byProfit = [...filteredPositions].sort((a, b) => b.unrealized_profit - a.unrealized_profit).slice(0, 8);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <label className="block">
          <span className="text-sm font-semibold">依分類標籤篩選</span>
          <select className="mt-2 w-full rounded-md border border-ink/15 bg-white px-3 py-3 outline-none focus:border-mint" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="all">全部標籤</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      </section>
      <ChartCard title="產業分布" data={byIndustry} />
      <ChartCard title="標籤分布" data={byTag} />
      <ListSection title="損益排行" empty="尚無資料">
        {byProfit.map((position) => (
          <Row
            key={position.stock_id}
            title={position.symbol + " " + position.name}
            subtitle={"市值 " + currency(position.market_value) + " · 報酬率 " + percent(position.unrealized_return_rate)}
            right={currency(position.unrealized_profit)}
            rightClass={profitClass(position.unrealized_profit)}
          />
        ))}
      </ListSection>
      <ListSection title="股票占比" empty="尚無資料">
        {byStock.map((item) => (
          <Row key={item.name} title={item.name} subtitle="持股市值" right={currency(item.value)} />
        ))}
      </ListSection>
    </div>
  );
}

function ChartCard({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <h2 className="font-bold">{title}</h2>
      {data.length ? (
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={2}>
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => currency(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink/55">尚無資料</p>
      )}
      <div className="mt-2 space-y-2">
        {data.slice(0, 5).map((item, index) => (
          <div className="flex items-center justify-between text-sm" key={item.name}>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
              {item.name}
            </span>
            <span>{currency(item.value)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
