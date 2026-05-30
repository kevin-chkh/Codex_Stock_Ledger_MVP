export function currency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

export function decimal(value: number, fractionDigits = 1) {
  return new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value || 0);
}

export function percent(value: number) {
  return ((value || 0) * 100).toFixed(2) + "%";
}

export function profitClass(value: number) {
  if (value > 0) return "text-coral";
  if (value < 0) return "text-mint";
  return "text-ink";
}

export function parseTags(value = "") {
  return value
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}
