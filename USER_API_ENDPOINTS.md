# User (Business Owner) API endpoints

All user APIs listed. **Not used in frontend** = commented out below each section.

**Base URL:** `{{baseUrl}}/api`  
**Auth:** `Authorization: Bearer <user_jwt_token>`

**Swagger UI:** `GET {{baseUrl}}/api-docs` – interactive API docs (OpenAPI 3.0).

---

## Auth (public – get token first)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register new business owner |
| POST | `/auth/login` | Login (returns JWT) |
| GET  | `/auth/verify-email/:token` | Verify email |
| POST | `/auth/resend-verification` | Resend verification email |
| POST | `/auth/forgot-password` | Forgot password |
| POST | `/auth/reset-password/:token` | Reset password |

**Login/register response:** Both return `{ success, message, data: { user, accessToken } }`. The `user` object has: `id`, `email`, `firstName`, `lastName`, `role`, `emailVerified`, `referralCode`, `phoneNumber`, `businessName`, `businessType`, `subscriptionStatus`, `subscriptionExpirationDate`, `subscriptionPlan`, `createdAt` (see User profile section for full example).

<!-- NOT USED IN FRONTEND: POST /auth/change-password, POST /auth/account-soft-delete (frontend uses PUT /users/change-password, PATCH /users/soft-delete) -->

---

## User profile (own account)

**Postman:** Add token in **Authorization** tab → Type: **Bearer Token** → Token: `{{accessToken}}` (get token from POST /auth/login). Without it you get `401 Access token required`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT  | `/users/change-password` | Change password. Body: `{ "currentPassword": "...", "newPassword": "..." }`. **Auth: Bearer token required.** |
| PATCH| `/users/soft-delete` | Soft delete own account. **Use PATCH** (not POST). No body – only Authorization Bearer token required. Wrong method (e.g. POST) → **405** "Method not allowed. Use PATCH to soft delete your account." |

**Update own profile (business details):** Use **PUT** `/users/:id` with the logged-in user’s `id`. Body example:

```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "test@plusfive.com",
  "phoneNumber": "0972501234567",
  "businessName": "My Salon",
  "businessType": "salon",
  "address": "Optional address",
  "whatsappNumber": "Optional WhatsApp",
  "directChatMessage": "Optional chat message"
}
```

**Response example (login/register/update user):**

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "user": {
      "id": "cml8yi8it0000141st3u4s59x",
      "email": "test@plusfive.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "user",
      "emailVerified": "2026-02-05T04:28:46.327Z",
      "referralCode": "PLUSFIVE2026C52EVV",
      "phoneNumber": "0972501234567",
      "businessName": "My Salon",
      "businessType": "salon",
      "subscriptionStatus": "pending",
      "subscriptionExpirationDate": null,
      "subscriptionPlan": null,
      "createdAt": "2026-02-05T04:28:46.332Z"
    }
  }
}
```

<!-- NOT USED IN FRONTEND: GET /users/profile, PUT /users/profile (frontend uses PUT /users/:id) -->

---

## Admin dashboard (business owner can call)

**Used in frontend** (via `redux/services/adminServices.jsx`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin-dashboard/monthly-performance` | Monthly performance (current month/year). No query params. |
| GET | `/admin-dashboard/customer-status` | Customer status breakdown |
| GET | `/admin-dashboard/qr-analytics` | QR analytics (current month). No query params. |
| GET | `/admin-dashboard/revenue-impacts` | Revenue by period: **monthly, weekly, lastMonth, yearly** (single response; no query params). Bar chart data. |
| GET | `/admin-dashboard/monthly-ltv-count` | Monthly LTV count |
| GET | `/admin-dashboard/revenue-counts` | Revenue counts |
| GET | `/admin-dashboard/average-rating-counts` | Average rating counts |

**`/admin-dashboard/revenue-impacts` – where used:** Bar chart in **AdminRevenueImpactCustomerStatus** (admin/home user home) and **AdminAnalyticsRevenueAndCustomerStatus** (analytics). Data: `monthly`, `weekly`, `lastMonth`, `yearly`.

<!-- REMOVED (data not displayed): GET /admin-dashboard/revenue-impact, GET /admin-dashboard/admin-summary, GET /admin-dashboard/overview. NOT USED: GET /admin-dashboard/lost-revenue. -->

---

## Customers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/customers` | Get all customers |
| GET  | `/customers/ten` | Get ten customers |
| GET  | `/customers/status-count` | Get customer status count |
| GET  | `/customers/:id` | Get customer by ID |
| POST | `/customers` | Add customer |
| POST | `/customers/bulk-import` | Bulk import customers |
| PUT  | `/customers/:id` | Update customer |
| DELETE | `/customers/bulk` | Remove multiple customers |
| DELETE | `/customers/:id` | Remove customer |

**POST /customers – Body (Postman):**  
Auth: **Authorization → Bearer Token** (JWT from login).

**Option A – Add existing customer (by ID):**
```json
{
  "customerId": "existing-customer-uuid-from-customers-table",
  "notes": "Optional notes",
  "rating": 5,
  "lastPayment": 100,
  "totalPaid": 500,
  "status": "active"
}
```
Required: `customerId`. Optional: `notes`, `rating` (0–5), `lastPayment`, `totalPaid`, `status`.

**Option B – Create new customer:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "972501234567",
  "email": "john@example.com",
  "address": "123 Street, City",
  "city": "Tel Aviv",
  "customerFullName": "John Doe",
  "birthdate": "1990-05-15",
  "notes": "Optional",
  "rating": 0,
  "lastPayment": 0,
  "totalPaid": 0,
  "status": "active",
  "isActive": true
}
```
Required: `firstName`, `lastName`, `phoneNumber`. All other fields optional.

---

## Staff

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/staff` | Get all staff |
| GET  | `/staff/:staffId/operating-hours` | Get staff operating hours |
| POST | `/staff/:staffId/operating-hours` | Upsert staff operating hours |
| PUT  | `/staff/operating-hours/:id` | Update operating hour |
| DELETE | `/staff/operating-hours/:id` | Delete operating hour |
| DELETE | `/staff/:staffId/operating-hours` | Delete all staff operating hours |
| POST | `/staff` | Create staff |
| GET  | `/staff/:id` | Get staff by ID |
| PUT  | `/staff/:id` | Update staff |
| DELETE | `/staff/:id` | Delete staff |
| DELETE | `/staff/bulk/delete` | Delete multiple staff |

---

## Staff services

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/staff/:staffId/services` | Get staff services |
| GET  | `/staff/:staffId/services/available` | Get available services for staff |
| POST | `/staff/:staffId/services` | Add/update staff service |
| DELETE | `/staff/:staffId/services/:serviceId` | Remove staff service |

---

## Business operating hours

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/business-operating-hours` | Get business operating hours |
| POST | `/business-operating-hours` | Upsert business operating hours |
| PUT  | `/business-operating-hours/:id` | Update one operating hour |
| DELETE | `/business-operating-hours/:id` | Delete one operating hour |
| DELETE | `/business-operating-hours` | Delete all operating hours |

---

## Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/services` | Get all services |
| GET  | `/services/:id` | Get service by ID |
| POST | `/services` | Create service |
| PUT  | `/services/:id` | Update service |
| DELETE | `/services/:id` | Delete service |
| DELETE | `/services/bulk/delete` | Delete multiple services |

---

## Categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/categories` | Get all categories |
| GET  | `/categories/:id` | Get category by ID |
| POST | `/categories` | Create category |
| PUT  | `/categories/:id` | Update category |
| DELETE | `/categories/bulk/delete` | Delete multiple categories |
| DELETE | `/categories/:id` | Delete category |

---

## Catalog categories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/catalog-categories` | Get all catalog categories |
| GET  | `/catalog-categories/:id` | Get catalog category by ID |
| POST | `/catalog-categories` | Create catalog category |
| PUT  | `/catalog-categories/:id` | Update catalog category |
| DELETE | `/catalog-categories/bulk/delete` | Delete multiple catalog categories |
| DELETE | `/catalog-categories/:id` | Delete catalog category |

---

## Suppliers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/suppliers` | Get all suppliers |
| GET  | `/suppliers/:id` | Get supplier by ID |
| POST | `/suppliers` | Create supplier |
| PUT  | `/suppliers/:id` | Update supplier |
| DELETE | `/suppliers/bulk/delete` | Delete multiple suppliers |
| DELETE | `/suppliers/:id` | Delete supplier |

---

## Products

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/products` | Get all products |
| GET  | `/products/:id` | Get product by ID |
| POST | `/products` | Create product |
| PUT  | `/products/:id` | Update product |
| DELETE | `/products/bulk/delete` | Delete multiple products |
| DELETE | `/products/:id` | Delete product |

---

## Waitlist

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/waitlist` | Get all waitlist entries |
| GET  | `/waitlist/:id` | Get waitlist by ID |
| POST | `/waitlist` | Create waitlist entry |
| PUT  | `/waitlist/:id` | Update waitlist entry |
| DELETE | `/waitlist/:id` | Delete waitlist entry |

---

## QR codes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/qr` | Get QR codes |
| GET  | `/qr/my-qr-codes` | Get my QR codes |
| GET  | `/qr/analytics` | QR analytics |
| GET  | `/qr/performance` | QR performance |
| GET  | `/qr/qr-code/:code` | Get QR by code |
| GET  | `/qr/:id/analytics` | QR analytics by ID |
| GET  | `/qr/:id/image` | QR image |
| GET  | `/qr/:id` | Get QR by ID |

---

## Webhooks (payments & appointments)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/payments` | Create payment |
| GET  | `/webhooks/payment-webhooks` | Get payment webhooks |
| GET  | `/webhooks/payment-webhooks/:id` | Get payment webhook by ID |
| GET  | `/webhooks/payment-webhooks/customer/:customerId` | Get payment webhooks by customer |
| POST | `/webhooks/appointments` | Create appointment |
| GET  | `/webhooks/appointments` | Get all appointments |
| GET  | `/webhooks/appointments/:id` | Get appointment by ID |
| PUT  | `/webhooks/appointments/:id` | Update appointment |
| PATCH | `/webhooks/appointments/:id/status` | Update appointment status |
| DELETE | `/webhooks/appointments/:id` | Delete appointment |
| GET  | `/webhooks/appointments/customer/:customerId` | Get appointments by customer |

---

## Support

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/support` | Get support tickets |
| GET  | `/support/:id` | Get support ticket by ID |

---

## Stripe / billing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/stripe/prices` | Get prices |
| GET  | `/stripe/subscription` | Get subscription |
| GET  | `/stripe/payment-methods` | Get payment methods |
| GET  | `/stripe/billing-dashboard` | Billing dashboard |
| GET  | `/stripe/payment-history` | Payment history |

---

## Payments (alternative)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/payments/prices` | Get prices |
| GET  | `/payments/subscription` | Get subscription |
| GET  | `/payments/payment-methods` | Get payment methods |

---

## WhatsApp messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/whatsapp-messages` | Get WhatsApp messages |

---

## Customer status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/customer-status/statistics` | Get customer status statistics |
| GET  | `/customer-status/status/:status` | Get customers by status |

---

## Auth for Postman

1. **Login or register** (e.g. `POST /api/auth/login` or `POST /api/auth/register`).
2. Copy the `accessToken` from the response (`data.accessToken`).
3. Set **Authorization** → Type: **Bearer Token** → Token: `{{accessToken}}`.
4. Use **PATCH** (not POST) for `/api/users/soft-delete`.
