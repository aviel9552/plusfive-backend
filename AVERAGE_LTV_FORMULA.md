# Average LTV Count Formula - Explanation

## Formula

```
averageLTVCount = totalRevenueForMonth ÷ customersWithPayments
```

## Formula Components

### 1. `totalRevenueForMonth`
- **Definition**: Total amount of all payments made **ONLY in that specific month**
- **Example for November**: Sum of all payments made between Nov 1 - Nov 30
- **Example for December**: Sum of all payments made between Dec 1 - Dec 31
- **Important**: Previous months' payments are **NOT included**

### 2. `customersWithPayments`
- **Definition**: Total number of customers who made payments **IN that specific month**
- **Important**: This is the count of customers who actually paid in that month, not lifetime count
- **Example**: November = 26 customers, December = 282 customers

## Example Calculation

### November 2025

**Data:**
- `totalRevenueForMonth` = $2,990 (total payments made in November only)
- `customersWithPayments` = 26 (customers who paid in November)

**Calculation:**
```
averageLTVCount = $2,990 ÷ 26
averageLTVCount = $115.00
```

**Result:** `"averageLTVCount": 115.00`

---

### December 2025

**Data:**
- `totalRevenueForMonth` = $35,140 (total payments made in December only)
- `customersWithPayments` = 282 (customers who paid in December)

**Calculation:**
```
averageLTVCount = $35,140 ÷ 282
averageLTVCount = $124.68
```

**Result:** `"averageLTVCount": 124.68`

---

## Why December is Higher?

1. **More Revenue**: December had much more total revenue ($35,140) compared to November ($2,990)
2. **More Customers**: More customers made payments in December (282 vs 26)
3. **Higher Average**: Even though there are more customers in December, the total revenue increased proportionally more, resulting in a higher average per customer

## Key Points

✅ **Numerator** (`totalRevenueForMonth`): Only payments from that specific month
✅ **Denominator** (`customersWithPayments`): Customers who paid IN that specific month
✅ **Result**: Average payment per customer who paid in that month

## Visual Example

**November:**
```
Total Payments in Nov: $2,990
Customers Who Paid in Nov: 26 (customersWithPayments)
Average = $2,990 ÷ 26 = $115.00
```

**December:**
```
Total Payments in Dec: $35,140
Customers Who Paid in Dec: 282 (customersWithPayments)
Average = $35,140 ÷ 282 = $124.68
```

**Key Point:**
- Formula uses `customersWithPayments` (customers who paid IN that month)
- Each month has different customer count based on who paid in that specific month

---

## Important Notes

1. **Monthly Revenue Only**: `totalRevenueForMonth` includes ONLY payments made in that month
2. **Monthly Customer Count**: `customersWithPayments` includes ONLY customers who paid in that specific month
3. **Formula Logic**: We divide monthly revenue by monthly customer count (not lifetime count)
4. **Not Cumulative**: Each month is calculated independently
5. **Frozen Values**: Once a month ends, its `averageLTVCount` value is frozen and won't change

