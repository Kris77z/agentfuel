# summarizeSales 实现

## 完整代码

```typescript
// ---------- 类型定义 ----------
export interface SalesRecord {
  month: string;
  revenue: number;
  cost: number;
  orders: number;
}

export interface MonthlySummary {
  month: string;
  grossProfit: number;
  grossMargin: number | null;
  averageOrderValue: number | null;
}

export interface SalesSummary {
  months: MonthlySummary[];
  total: {
    revenue: number;
    grossProfit: number;
    grossMargin: number | null;
  };
}

// ---------- 校验辅助 ----------
function assertValidNumber(value: number, field: string, month: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `[summarizeSales] month="${month}" 字段 "${field}" 必须是非 NaN/Infinity 的有限数，收到: ${String(value)}`
    );
  }
  if (value < 0) {
    throw new Error(
      `[summarizeSales] month="${month}" 字段 "${field}" 不允许为负数，收到: ${value}`
    );
  }
}

function assertValidOrders(value: number, month: string): void {
  assertValidNumber(value, "orders", month);
  if (!Number.isInteger(value)) {
    throw new Error(
      `[summarizeSales] month="${month}" 字段 "orders" 必须为整数，收到: ${value}`
    );
  }
}

// ---------- 主函数（纯函数，不修改入参） ----------
export function summarizeSales(records: SalesRecord[]): SalesSummary {
  if (!Array.isArray(records)) {
    throw new Error("[summarizeSales] 输入必须是数组");
  }

  const months: MonthlySummary[] = records.map((r) => {
    if (r === null || typeof r !== "object") {
      throw new Error("[summarizeSales] 数组项必须是对象");
    }
    const { month, revenue, cost, orders } = r;
    if (typeof month !== "string" || month.length === 0) {
      throw new Error(
        `[summarizeSales] month 必须是非空字符串，收到: ${String(month)}`
      );
    }
    assertValidNumber(revenue, "revenue", month);
    assertValidNumber(cost, "cost", month);
    assertValidOrders(orders, month);

    const grossProfit = revenue - cost;
    const grossMargin = revenue === 0 ? null : grossProfit / revenue;
    const averageOrderValue = orders === 0 ? null : revenue / orders;

    return { month, grossProfit, grossMargin, averageOrderValue };
  });

  const totalRevenue = months.reduce(
    (sum, _, i) => sum + records[i].revenue,
    0
  );
  const totalGrossProfit = months.reduce((sum, m) => sum + m.grossProfit, 0);
  const totalGrossMargin =
    totalRevenue === 0 ? null : totalGrossProfit / totalRevenue;

  return {
    months,
    total: {
      revenue: totalRevenue,
      grossProfit: totalGrossProfit,
      grossMargin: totalGrossMargin,
    },
  };
}
```

## 简短说明

- **纯函数**：不修改入参，不依赖外部状态，相同输入恒返回相同结构的新对象。
- **逐月指标**：
  - `grossProfit = revenue - cost`
  - `grossMargin = grossProfit / revenue`；当 `revenue === 0` 时为 `null`
  - `averageOrderValue = revenue / orders`；当 `orders === 0` 时为 `null`
- **总计**：`revenue`、`grossProfit` 为各月求和；`grossMargin = 总grossProfit / 总revenue`，总 revenue 为 0 时为 `null`。
- **校验规则**：`revenue` / `cost` / `orders` 为负数、`NaN`、`±Infinity` 或非 number 时抛 `Error`；`orders` 非整数（如 2.5）抛错；`month` 为空字符串或非字符串抛错。
- 比率为**小数**（0.25 表示 25%），未做四舍五入，需要展示时自行格式化。

## 输入 / 预期输出样例

### 样例 1：正常多行 + 总计

输入：
```typescript
summarizeSales([
  { month: "2024-01", revenue: 10000, cost: 6000, orders: 200 },
  { month: "2024-02", revenue: 5000, cost: 4000, orders: 100 },
]);
```

预期输出：
```typescript
{
  months: [
    { month: "2024-01", grossProfit: 4000, grossMargin: 0.4, averageOrderValue: 50 },
    { month: "2024-02", grossProfit: 1000, grossMargin: 0.2, averageOrderValue: 50 },
  ],
  total: { revenue: 15000, grossProfit: 5000, grossMargin: 5000 / 15000 }, // ≈ 0.3333333333333333
}
```

### 样例 2：零收入 / 零订单 → 比率为 null

输入：
```typescript
summarizeSales([
  { month: "2024-03", revenue: 0, cost: 0, orders: 0 },
  { month: "2024-04", revenue: 3000, cost: 1000, orders: 0 },
]);
```

预期输出：
```typescript
{
  months: [
    // revenue 为 0 → grossMargin 为 null；orders 为 0 → averageOrderValue 为 null
    { month: "2024-03", grossProfit: 0, grossMargin: null, averageOrderValue: null },
    // orders 为 0 → averageOrderValue 为 null；grossMargin 正常计算
    { month: "2024-04", grossProfit: 2000, grossMargin: 2000 / 3000, averageOrderValue: null }, // ≈ 0.6666666666666666
  ],
  total: { revenue: 3000, grossProfit: 2000, grossMargin: 2000 / 3000 }, // ≈ 0.6666666666666666
}
```

### 样例 3：非法输入抛错

输入：
```typescript
summarizeSales([{ month: "2024-05", revenue: -100, cost: 50, orders: 10 }]);
// 抛出 Error: [summarizeSales] month="2024-05" 字段 "revenue" 不允许为负数，收到: -100

summarizeSales([{ month: "2024-05", revenue: 1000, cost: NaN, orders: 10 }]);
// 抛出 Error: [summarizeSales] month="2024-05" 字段 "cost" 必须是非 NaN/Infinity 的有限数，收到: NaN

summarizeSales([{ month: "2024-05", revenue: 1000, cost: 500, orders: 2.5 }]);
// 抛出 Error: [summarizeSales] month="2024-05" 字段 "orders" 必须为整数，收到: 2.5
```

> 注：以上为按代码逻辑推导的预期结果，未实际运行代码验证。浮点除法结果（如 1/3）以 JavaScript 双精度为准，建议断言时使用 `toBeCloseTo`。