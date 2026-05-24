import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(url, key);
const tables = ["portfolios", "cash_movements", "stocks", "stock_tags", "trades", "settings"];

let hasError = false;
for (const table of tables) {
  const { error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) {
    hasError = true;
    console.error(`[FAIL] ${table}: ${error.message}`);
  } else {
    console.log(`[OK] ${table}`);
  }
}

if (hasError) process.exit(1);
console.log("Supabase QA passed.");
