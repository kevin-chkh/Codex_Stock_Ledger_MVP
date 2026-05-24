# Mobile QA Checklist

## Viewports

- 375 x 812
- 390 x 844
- 430 x 932

## Layout

1. Header stays visible and not overlapping content.
2. Message bar is readable and dismissible.
3. Bottom nav does not cover primary actions.
4. FAB does not block list item actions.
5. Bottom sheet opens and closes reliably.

## Trade Flow

1. Open quick action -> buy.
2. Enter symbol/name and pick suggestion.
3. Verify fee/tax preview updates.
4. Save and verify dashboard updates.
5. Edit same trade and verify recalculation.
6. Delete trade and verify rollback.

## Analytics & Holdings

1. Holdings filters work with no overlap.
2. Analytics tag filter updates chart and rankings.
3. Long text labels are truncated without breaking layout.

## Data

1. Refresh page and confirm local persistence.
2. Export JSON, reset demo, import JSON, compare counts.
3. Import CSV and verify imported trade count message.
