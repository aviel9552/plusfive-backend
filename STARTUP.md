# Plusfive Backend – Startup & Constants Reference

Quick reference for project setup and centralized constants (`config/constants.js`).

---

## Constants Overview

All application constants are defined in **`config/constants.js`**. Use these in controllers, services, and lib instead of magic strings or numbers.

---

### User Roles

| Key      | Value       |
|----------|-------------|
| ADMIN    | `'admin'`   |
| USER     | `'user'`    |
| CUSTOMER | `'customer'`|

---

### Status Values

| Key      | Value        |
|----------|--------------|
| ACTIVE   | `'active'`   |
| INACTIVE | `'inactive'` |
| PENDING  | `'pending'`  |
| DELETED  | `'deleted'`   |

---

### Subscription Status

| Key       | Value         |
|-----------|----------------|
| ACTIVE    | `'active'`     |
| INACTIVE  | `'inactive'`   |
| PENDING   | `'pending'`    |
| CANCELED  | `'canceled'`   |
| EXPIRED   | `'expired'`     |

---

### Customer Status

| Key       | Value         |
|-----------|----------------|
| NEW       | `'new'`        |
| ACTIVE    | `'active'`     |
| AT_RISK   | `'at_risk'`    |
| RISK      | `'risk'`       |
| LOST      | `'lost'`       |
| RECOVERED | `'recovered'`  |

---

### Customer Status Colors (charts, badges, API – shared with frontend)

| Label     | Hex       |
|-----------|-----------|
| New       | `#ff257c` |
| Active    | `#ff4e94` |
| At Risk   | `#ff7db1` |
| Lost      | `#ffb7d4` |
| Recovered | `#ffd5e6` |
| Lead      | `#f70964` |

---

### Webhook Types

| Key             | Value                |
|-----------------|----------------------|
| APPOINTMENT     | `'appointment'`       |
| PAYMENT_CHECKOUT| `'payment_checkout'` |
| RATING          | `'rating'`           |

---

### Webhook Status

| Key       | Value         |
|-----------|----------------|
| PENDING   | `'pending'`    |
| PROCESSED | `'processed'`  |
| FAILED    | `'failed'`     |

---

### Review Status

| Key       | Value         |
|-----------|----------------|
| SENT      | `'sent'`       |
| RECEIVED  | `'received'`   |
| PROCESSED | `'processed'`  |
| RESPONDED | `'responded'`  |

---

### Support Ticket Status

| Key          | Value            |
|--------------|------------------|
| OPEN         | `'open'`         |
| IN_PROGRESS  | `'in_progress'`  |
| RESOLVED     | `'resolved'`     |
| CLOSED       | `'closed'`       |

---

### Support Ticket Priority

| Key    | Value      |
|--------|------------|
| LOW    | `'low'`    |
| MEDIUM | `'medium'` |
| HIGH   | `'high'`   |
| URGENT | `'urgent'` |

---

### Payment Status

| Key       | Value         |
|-----------|----------------|
| SUCCESS   | `'success'`    |
| SUCCEEDED | `'succeeded'`  |
| FAILED    | `'failed'`     |
| PENDING   | `'pending'`    |

---

### Cloudinary Folders

| Key      | Value       |
|----------|-------------|
| STAFF    | `'Staff'`    |
| CUSTOMER | `'Customer'`|

---

### Supplier Status (Hebrew UI)

| Key      | Value     |
|----------|-----------|
| ACTIVE   | `'פעיל'`   |
| INACTIVE | `'לא פעיל'`|

---

### Supplier Status Boolean

| Key      | Value  |
|----------|--------|
| ACTIVE   | `true` |
| INACTIVE | `false`|

---

### Product Status (Hebrew UI)

| Key      | Value     |
|----------|-----------|
| ACTIVE   | `'פעיל'`   |
| INACTIVE | `'לא פעיל'`|

---

### Product Status Boolean

| Key      | Value  |
|----------|--------|
| ACTIVE   | `true` |
| INACTIVE | `false`|

---

### Waitlist Status

| Key     | Value       |
|---------|-------------|
| WAITING | `'waiting'` |
| EXPIRED | `'expired'` |
| BOOKED  | `'booked'`  |

---

### Appointment Status (matches Prisma enum AppointmentStatus)

| Key       | Value        |
|-----------|---------------|
| BOOKED    | `'booked'`    |
| CANCELLED | `'cancelled'` |
| SCHEDULED | `'scheduled'` |

---

### Days of the Week

Index 0 = Sunday … 6 = Saturday. Each item: `{ key, label }` (e.g. `sunday`, `ראשון`).

- **DAYS_OF_WEEK_KEYS**: `['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']`

---

### JS getDay() → Hebrew Abbrev (availability / operating hours)

**JS_DAY_TO_HEBREW**: `["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"]`

- Day key for same index: use **DAYS_OF_WEEK_KEYS[index]**.
- Used in `lib/availabilityHelper.js` for business/staff hours.

---

### Recurrence Service Type (match frontend – use in recurrenceHelper)

| Key           | Value               |
|---------------|---------------------|
| REGULAR       | `'Regular Appointment'` |
| EVERY_DAY     | `'Every Day'`       |
| EVERY_WEEK    | `'Every Week'`      |
| EVERY_2_WEEKS | `'Every 2 Weeks'`   |
| EVERY_3_WEEKS | `'Every 3 Weeks'`   |
| EVERY_MONTH   | `'Every Month'`     |
| EVERY_2_MONTHS| `'Every 2 Months'`  |
| PREFIX_EVERY  | `'Every '`          |

---

### Recurrence Duration Unit (parsed from duration string – lowercase)

| Key   | Value     |
|-------|-----------|
| DAY   | `'day'`   |
| WEEK  | `'week'`  |
| MONTH | `'month'` |
| YEAR  | `'year'`  |

---

### Recurrence – Days per Unit (day-based calculations)

| Key   | Value |
|-------|-------|
| WEEK  | 7     |
| MONTH | 28    |
| YEAR  | 365   |

---

### Time Options

Generated from **00:00** to **23:55** in **5-minute intervals** (e.g. `00:00`, `00:05`, … `23:55`).

---

## Usage

```javascript
const constants = require('./config/constants');

// Use in controllers / services / lib
if (req.user.role === constants.ROLES.ADMIN) { ... }
if (appointment.appointmentStatus === constants.APPOINTMENT_STATUS.CANCELLED) { ... }
const daysInMonth = constants.RECURRENCE_DAYS_PER.MONTH;

// availabilityHelper / recurrenceHelper
const { JS_DAY_TO_HEBREW, DAYS_OF_WEEK_KEYS } = require('../config/constants');
```

---

## File Location

- **Constants:** `config/constants.js`
