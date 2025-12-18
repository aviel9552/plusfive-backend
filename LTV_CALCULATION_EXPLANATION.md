# Lifetime Value (LTV) Calculation Logic - Explanation

## Overview
The LTV calculation now uses a **cumulative approach** where each month shows the total LTV accumulated up to the end of that month. Once a month ends, its LTV value is **frozen** and will never change, even when new payments are added in future months.

## Key Principles

1. **Cumulative Calculation**: Each month's LTV includes ALL payments made from the beginning up to the end of that month
2. **Frozen Values**: Once a month ends, its LTV value is locked and won't be recalculated
3. **Continuous Growth**: Each new month starts from where the previous month ended and adds new payments

## Example Scenario

Let's say we have 3 customers with the following payment history:

### Customer A: "יובל שנהב"
- **Nov 5, 2025**: Payment of $100
- **Nov 15, 2025**: Payment of $100
- **Dec 10, 2025**: Payment of $100
- **Dec 20, 2025**: Payment of $100

### Customer B: "עדי פרץ"
- **Nov 10, 2025**: Payment of $130
- **Dec 5, 2025**: Payment of $100

### Customer C: "בן אור"
- **Dec 1, 2025**: Payment of $130

---

## Month-by-Month Calculation

### **November 2025** (Ends: Nov 30, 2025)

**Payments included (up to Nov 30):**
- Customer A: $100 + $100 = **$200** (2 payments in Nov)
- Customer B: $130 (1 payment in Nov)
- Customer C: $0 (no payments yet)

**Calculation:**
- Total Cumulative LTV = $200 + $130 + $0 = **$330**
- Customers who paid = 2 (Customer A and B)
- **Average LTV = $330 ÷ 2 = $165**

**Result for November:**
- `averageLTVCount`: **$165**
- `customersWithPayments`: **2**
- Customer A: `ltvCount`: **$200** (cumulative up to Nov 30)
- Customer B: `ltvCount`: **$130** (cumulative up to Nov 30)
- Customer C: Not included (no payments yet)

**✅ This value is FROZEN at the end of November and will never change**

---

### **December 2025** (Ends: Dec 31, 2025)

**Payments included (up to Dec 31):**
- Customer A: $100 + $100 + $100 + $100 = **$400** (includes Nov + Dec payments)
- Customer B: $130 + $100 = **$230** (includes Nov + Dec payments)
- Customer C: $130 (1 payment in Dec)

**Calculation:**
- Total Cumulative LTV = $400 + $230 + $130 = **$760**
- Customers who paid = 3 (Customer A, B, and C)
- **Average LTV = $760 ÷ 3 = $253.33**

**Result for December:**
- `averageLTVCount`: **$253.33**
- `customersWithPayments`: **3**
- Customer A: `ltvCount`: **$400** (cumulative up to Dec 31)
- Customer B: `ltvCount`: **$230** (cumulative up to Dec 31)
- Customer C: `ltvCount`: **$130** (cumulative up to Dec 31)

**✅ Notice:**
- November's value remains **$165** (frozen)
- December starts from November's data and adds December's new payments
- Customer A's LTV grew from $200 (Nov) to $400 (Dec)
- Customer B's LTV grew from $130 (Nov) to $230 (Dec)
- Customer C appears for the first time in December

---

## Important Points

### 1. **Historical Data Protection**
- November's LTV of $165 will **never change**, even if:
  - New payments are discovered from November (data correction)
  - December payments are added
  - Future months are calculated

### 2. **Cumulative Nature**
- Each month shows the **total lifetime value** accumulated up to that point
- It's not just "payments made in that month"
- It's "all payments from the beginning up to the end of that month"

### 3. **Formula**
```
Average LTV for Month X = 
  (Sum of all customers' cumulative LTV up to end of Month X) 
  ÷ 
  (Total number of customers who have paid at least once)
```

### 4. **Customer Details**
- `ltvCount`: Shows the customer's **cumulative LTV** up to the end of that month
- `paymentCount`: Shows how many payments were made **IN that specific month** (for reference)
- `totalRevenue`: Same as `ltvCount` (cumulative up to month end)

---

## Real-World Example from Your Data

Based on your actual data:

**November 2025:**
- 26 customers made payments
- Average LTV: **$9.90**
- This represents cumulative LTV up to Nov 30, 2025

**December 2025:**
- 282 customers made payments (includes all previous customers + new ones)
- Average LTV: **$116.36**
- This represents cumulative LTV up to Dec 31, 2025

**Why the big jump?**
- More customers started paying in December
- Existing customers made additional payments
- The cumulative total grew significantly

**November's value ($9.90) remains frozen** - it will always show what the average LTV was at the end of November, regardless of what happens in December or future months.

---

## Benefits of This Approach

1. ✅ **Historical Accuracy**: Past months show exactly what the LTV was at that time
2. ✅ **No Retroactive Changes**: Historical data doesn't change when new payments arrive
3. ✅ **Clear Growth Tracking**: Easy to see how LTV grows month-over-month
4. ✅ **Data Integrity**: Each month's snapshot is preserved forever

---

## Technical Implementation

The system:
1. Collects all payments for all customers
2. For each month (Jan through Dec):
   - Filters payments up to that month's end date
   - Calculates cumulative LTV for each customer
   - Sums all customers' cumulative LTV
   - Divides by total customers who have paid
3. Returns frozen values for each month

This ensures that when you view November's data in January, it will show the same value as it did in November - **$9.90** - even though December now shows **$116.36**.


