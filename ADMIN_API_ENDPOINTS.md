# Admin API endpoints

Use this list to build a Postman collection or share with the client. Endpoints are either **admin-only** or **admin + business owner** (admin can call both).

**Base URL:** `{{baseUrl}}/api` (e.g. `https://your-api.com/api`)  
**Auth:** `Authorization: Bearer <admin_jwt_token>`

**Swagger UI:** `GET {{baseUrl}}/api-docs` – interactive API docs (OpenAPI 3.0).

---

## Part 1: Admin-only (role must be `admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/users` | Create new user |
| GET    | `/users` | Get all users |
| GET    | `/users/:id` | Get user by ID |
| PUT    | `/users/:id` | Update user by ID |
| DELETE | `/users/:id` | Delete user by ID |

---

## Part 2: All GET APIs admin can call

Admin can call every GET below (authenticated as admin or admin+user routes).

### Users
| Method | Endpoint |
|--------|----------|
| GET | `/users` |
| GET | `/users/profile` |
| GET | `/users/:id` |

### Admin dashboard (admin + business owner)
| Method | Endpoint |
|--------|----------|
| GET | `/admin-dashboard/monthly-performance?month=&year=` |
| GET | `/admin-dashboard/revenue-impact?months=` |
| GET | `/admin-dashboard/customer-status` |
| GET | `/admin-dashboard/admin-summary` |
| GET | `/admin-dashboard/overview?month=&year=&months=` |
| GET | `/admin-dashboard/qr-analytics?period=&year=` |
| GET | `/admin-dashboard/revenue-impacts` |
| GET | `/admin-dashboard/monthly-ltv-count` |
| GET | `/admin-dashboard/revenue-counts` |
| GET | `/admin-dashboard/average-rating-counts` |

### Customers
| Method | Endpoint |
|--------|----------|
| GET | `/customers` |
| GET | `/customers/ten` |
| GET | `/customers/status-count` |
| GET | `/customers/:id` |

### Staff
| Method | Endpoint |
|--------|----------|
| GET | `/staff` |
| GET | `/staff/:staffId/operating-hours` |
| GET | `/staff/:id` |
| GET | `/staff/:staffId/services` |
| GET | `/staff/:staffId/services/available` |

### Business operating hours
| Method | Endpoint |
|--------|----------|
| GET | `/business-operating-hours` |

### Services
| Method | Endpoint |
|--------|----------|
| GET | `/services` |
| GET | `/services/:id` |

### Categories
| Method | Endpoint |
|--------|----------|
| GET | `/categories` |
| GET | `/categories/:id` |

### Catalog categories
| Method | Endpoint |
|--------|----------|
| GET | `/catalog-categories` |
| GET | `/catalog-categories/:id` |

### Suppliers
| Method | Endpoint |
|--------|----------|
| GET | `/suppliers` |
| GET | `/suppliers/:id` |

### Products
| Method | Endpoint |
|--------|----------|
| GET | `/products` |
| GET | `/products/:id` |

### Waitlist
| Method | Endpoint |
|--------|----------|
| GET | `/waitlist` |
| GET | `/waitlist/:id` |

### QR codes
| Method | Endpoint |
|--------|----------|
| GET | `/qr` |
| GET | `/qr/my-qr-codes` |
| GET | `/qr/analytics` |
| GET | `/qr/performance` |
| GET | `/qr/qr-code/:code` |
| GET | `/qr/:id/analytics` |
| GET | `/qr/:id/image` |
| GET | `/qr/:id` |

### Webhooks (payments & appointments)
| Method | Endpoint |
|--------|----------|
| GET | `/webhooks/payment-webhooks` |
| GET | `/webhooks/payment-webhooks/:id` |
| GET | `/webhooks/payment-webhooks/customer/:customerId` |
| GET | `/webhooks/appointments` |
| GET | `/webhooks/appointments/:id` |
| GET | `/webhooks/appointments/customer/:customerId` |

### Support
| Method | Endpoint |
|--------|----------|
| GET | `/support` |
| GET | `/support/:id` |

### Stripe / billing
| Method | Endpoint |
|--------|----------|
| GET | `/stripe/prices` |
| GET | `/stripe/subscription` |
| GET | `/stripe/payment-methods` |
| GET | `/stripe/billing-dashboard` |
| GET | `/stripe/payment-history` |

### Payments (alternative)
| Method | Endpoint |
|--------|----------|
| GET | `/payments/prices` |
| GET | `/payments/subscription` |
| GET | `/payments/payment-methods` |

### WhatsApp messages
| Method | Endpoint |
|--------|----------|
| GET | `/whatsapp-messages` |

### Customer status (no auth on route; for dashboard)
| Method | Endpoint |
|--------|----------|
| GET | `/customer-status/statistics` |
| GET | `/customer-status/status/:status` |

### Cron test (dev/debug; authenticated)
| Method | Endpoint |
|--------|----------|
| GET | `/cron-test/run-cron` |
| GET | `/cron-test/process-lost` |
| GET | `/cron-test/status-stats` |
| GET | `/cron-test/recent-changes` |
| GET | `/cron-test/check-customer/:customerId` |
| GET | `/cron-test/customers/:status` |

---

## Summary: All GET endpoints for Postman (admin)

```
GET  /api/users
GET  /api/users/profile
GET  /api/users/:id
GET  /api/admin-dashboard/monthly-performance
GET  /api/admin-dashboard/revenue-impact
GET  /api/admin-dashboard/customer-status
GET  /api/admin-dashboard/admin-summary
GET  /api/admin-dashboard/overview
GET  /api/admin-dashboard/qr-analytics
GET  /api/admin-dashboard/revenue-impacts
GET  /api/admin-dashboard/monthly-ltv-count
GET  /api/admin-dashboard/revenue-counts
GET  /api/admin-dashboard/average-rating-counts
GET  /api/customers
GET  /api/customers/ten
GET  /api/customers/status-count
GET  /api/customers/:id
GET  /api/staff
GET  /api/staff/:staffId/operating-hours
GET  /api/staff/:id
GET  /api/staff/:staffId/services
GET  /api/staff/:staffId/services/available
GET  /api/business-operating-hours
GET  /api/services
GET  /api/services/:id
GET  /api/categories
GET  /api/categories/:id
GET  /api/catalog-categories
GET  /api/catalog-categories/:id
GET  /api/suppliers
GET  /api/suppliers/:id
GET  /api/products
GET  /api/products/:id
GET  /api/waitlist
GET  /api/waitlist/:id
GET  /api/qr
GET  /api/qr/my-qr-codes
GET  /api/qr/analytics
GET  /api/qr/performance
GET  /api/qr/qr-code/:code
GET  /api/qr/:id/analytics
GET  /api/qr/:id/image
GET  /api/qr/:id
GET  /api/webhooks/payment-webhooks
GET  /api/webhooks/payment-webhooks/:id
GET  /api/webhooks/payment-webhooks/customer/:customerId
GET  /api/webhooks/appointments
GET  /api/webhooks/appointments/:id
GET  /api/webhooks/appointments/customer/:customerId
GET  /api/support
GET  /api/support/:id
GET  /api/stripe/prices
GET  /api/stripe/subscription
GET  /api/stripe/payment-methods
GET  /api/stripe/billing-dashboard
GET  /api/stripe/payment-history
GET  /api/payments/prices
GET  /api/payments/subscription
GET  /api/payments/payment-methods
GET  /api/whatsapp-messages
GET  /api/customer-status/statistics
GET  /api/customer-status/status/:status
GET  /api/cron-test/run-cron
GET  /api/cron-test/process-lost
GET  /api/cron-test/status-stats
GET  /api/cron-test/recent-changes
GET  /api/cron-test/check-customer/:customerId
GET  /api/cron-test/customers/:status
```

**Total: 7 admin-only endpoints (any method).**  
**Total: 70+ GET endpoints** that admin can call.

---

## Auth for Postman

1. **Login as admin** (e.g. `POST /api/auth/login` with admin credentials).
2. Copy the JWT from the response.
3. Set **Authorization** → Type: **Bearer Token** → Token: `{{accessToken}}`.
4. Add collection variable: `accessToken` = the copied JWT (or use a pre-request script to login and set it).
