# Daily Report – 05 February 2026

## Summary

Backend and frontend changes for the **snehal** branch: referral feature removal, admin dashboard API cleanup (unused/undisplayed endpoints removed), user auth/profile alignment with frontend, soft-delete fixes, API documentation (USER/ADMIN endpoints + Swagger), and Swagger live server URL.

---

## Backend (plusfive-backend)

### 1. Referral feature removed
- **Deleted:** `controllers/referralController.js`, `routes/referrals.js`
- **Modified:** `server.js` – removed referral routes mount
- **Modified:** `controllers/authController.js` – removed referral creation on register (e.g. `createReferral`, Stripe affiliate coupon)
- **Modified:** `prisma/schema.prisma` – removed `Referral` model and User referral relations (`referralsGiven`, `referralsReceived`); kept `User.referralCode` if used for display
- **New migration:** `prisma/migrations/20260205120000_drop_referrals_table/migration.sql` – drops `referrals` table

### 2. User auth & profile (align with frontend)
- **Modified:** `routes/auth.js` – removed `POST /auth/change-password`, `POST /auth/account-soft-delete` (frontend uses `PUT /users/change-password`, `PATCH /users/soft-delete`)
- **Modified:** `routes/users.js` – removed `GET /users/profile`, `PUT /users/profile`; added `router.all('/soft-delete', ...)` to return **405** for wrong method (e.g. POST) with message to use PATCH
- **Modified:** `controllers/userController.js` – removed `getProfile`, `updateProfile`; improved `softDelete` error handling (401/404/400/403/500 with clearer messages)
- **Modified:** `server.js` – custom JSON body middleware so empty/whitespace body with `Content-Type: application/json` is treated as `{}` (avoids 500 on PATCH soft-delete from Postman)

### 3. Admin dashboard API cleanup
- **Modified:** `routes/adminDashboard.js` – removed routes:
  - `GET /admin-dashboard/admin-summary`
  - `GET /admin-dashboard/overview`
  - `GET /admin-dashboard/revenue-impact`
- **Modified:** `controllers/adminDashboardController.js` – removed:
  - `getRevenueImpact`, `getAdminSummary`, `getDashboardOverview`
  - helpers: `getRevenueImpactData`, `getAdminSummaryData`
- **Reason:** These endpoints were either not called by the frontend or their data was not displayed in the UI (only loading/error used). Bar chart uses `/admin-dashboard/revenue-impacts` only.

### 4. Optional query params removed
- Admin dashboard endpoints (`monthly-performance`, `revenue-impact`, `overview`, `qr-analytics`) no longer rely on query params; backend uses current month/year and fixed defaults (e.g. 7 months for revenue). Route comments updated to state “no query params”.

### 5. API documentation
- **New:** `USER_API_ENDPOINTS.md` – User (business owner) API list; which are used in frontend; body examples for auth, change-password, soft-delete, PUT users/:id, POST customers; commented “not used” / “removed” sections
- **New:** `ADMIN_API_ENDPOINTS.md` – Admin-only and shared GET endpoints list for Postman/collection
- **New:** `docs/swaggerDoc.js` – OpenAPI 3.0 spec for Swagger UI
- **Modified:** `server.js` – mount Swagger UI at `/api-docs`; startup log for docs URL
- **Swagger servers:** `Current host`, `Local (development)`, `Live (production)` – Live = `https://plusfive-backend.vercel.app/api`

### 6. Dependencies
- **Modified:** `package.json` / `package-lock.json` – added `swagger-ui-express`

---

## Frontend (plusfive-frontend)

### 1. Referral feature removed
- **Deleted:**
  - Pages: `src/pages/referral/index.jsx`, `src/pages/ReferralManagement/index.jsx`, `src/pages/admin/ReferralManagement/index.jsx`
  - Components: `src/components/referral/*`, `src/components/admin/referral/*`, `src/components/home/Referrals.jsx`, `src/components/admin/home/AdminReferrals.jsx`
  - Redux: `src/redux/services/referralService.jsx`, `src/redux/actions/referralActions.jsx`, `src/redux/reducers/referralReducer.jsx`
- **Modified:**
  - `lib/store.jsx` – removed `referralReducer`
  - `src/redux/services/authService.jsx` – removed `createReferral` (and any referral call after register)
  - `src/pages/auth/register.jsx` – removed referral-related logic/UI
  - `src/pages/admin/home/index.jsx` – removed referral section/import
  - `src/routes/publicRoutes.jsx`, `src/routes/userRoutes.jsx`, `src/routes/adminRoutes.jsx` – removed referral routes
  - `src/components/index.jsx` – removed referral component exports

### 2. Admin dashboard API usage cleanup
- **Removed usage of:** `/admin-dashboard/overview`, `/admin-dashboard/admin-summary`, `/admin-dashboard/revenue-impact`
- **Modified:** `src/redux/services/adminServices.jsx` – removed `getAdminSummary`, `getAdminDashboardOverview`, `getAdminRevenueImpact`
- **Modified:** `src/redux/actions/adminActions.jsx` – removed summary/overview/revenue-impact actions and types
- **Modified:** `src/redux/reducers/adminReducer.jsx` – removed `adminSummary`, `dashboardOverview`, `revenueImpact` state and related action handlers
- **Modified:** `src/hooks/useAdminData.js` – `fetchAllData()` now dispatches only `fetchAdminMonthlyPerformance()` and `fetchAdminCustomerStatus()`; removed `fetchSummary`, `fetchRevenueImpact`, and exposed state for summary/overview/revenueImpact
- **Modified:** `src/components/admin/home/AdminRevenueImpactCustomerStatus.jsx` – uses only `customerStatus` and `fetchCustomerStatus`; bar chart loading/error from local state (`revenueImpactsLoading`, `revenueImpactsError`) and `/admin-dashboard/revenue-impacts` only
- **Modified:** `src/components/admin/analytics/AdminAnalyticsRevenueAndCustomerStatus.jsx` – same: no revenue-impact API; `Promise.all` only `getRevenueImpacts()` and `fetchCustomerStatus()`; bar chart error from `revenueImpactsError`
- **Modified:** `src/components/admin/analytics/AdminAnalyticsMonthlyPerformance.jsx` – no dependency on overview/summary/revenue-impact (if any was removed)

---

## Git status (at report time)

### Backend – modified
- `controllers/adminDashboardController.js`
- `controllers/authController.js`
- `controllers/userController.js`
- `package.json` / `package-lock.json`
- `prisma/schema.prisma`
- `routes/adminDashboard.js`
- `routes/auth.js`
- `routes/users.js`
- `server.js`

### Backend – deleted
- `controllers/referralController.js`
- `routes/referrals.js`

### Backend – untracked (new)
- `ADMIN_API_ENDPOINTS.md`
- `USER_API_ENDPOINTS.md`
- `docs/` (Swagger spec)
- `prisma/migrations/20260205120000_drop_referrals_table/`

### Frontend – modified
- `lib/store.jsx`
- `src/components/admin/analytics/AdminAnalyticsMonthlyPerformance.jsx`
- `src/components/admin/analytics/AdminAnalyticsRevenueAndCustomerStatus.jsx`
- `src/components/admin/home/AdminRevenueImpactCustomerStatus.jsx`
- `src/components/index.jsx`
- `src/hooks/useAdminData.js`
- `src/pages/admin/home/index.jsx`
- `src/pages/auth/register.jsx`
- `src/redux/actions/adminActions.jsx`
- `src/redux/reducers/adminReducer.jsx`
- `src/redux/services/adminServices.jsx`
- `src/redux/services/authService.jsx`
- `src/routes/adminRoutes.jsx`
- `src/routes/publicRoutes.jsx`
- `src/routes/userRoutes.jsx`

### Frontend – deleted
- `src/components/admin/home/AdminReferrals.jsx`
- `src/components/admin/referral/*`
- `src/components/home/Referrals.jsx`
- `src/components/referral/*`
- `src/pages/ReferralManagement/index.jsx`
- `src/pages/admin/ReferralManagement/index.jsx`
- `src/pages/referral/index.jsx`
- `src/redux/actions/referralActions.jsx`
- `src/redux/reducers/referralReducer.jsx`
- `src/redux/services/referralService.jsx`

---

## Deployment / next steps

1. **Backend:** Run Prisma migration for drop referrals:  
   `npx prisma migrate deploy` (or `prisma migrate dev` in dev).
2. **Backend:** Deploy to Vercel; ensure env (e.g. `DATABASE_URL`, `JWT_SECRET`) is set.
3. **Frontend:** Deploy after backend is live; ensure API base URL points to `https://plusfive-backend.vercel.app/api` (or correct env).
4. **Swagger:** Live docs at `https://plusfive-backend.vercel.app/api-docs` (if backend is deployed with `/api-docs` and `docs/swaggerDoc.js`).

---

## References

- USER_API_ENDPOINTS.md – business owner APIs, Postman body examples
- ADMIN_API_ENDPOINTS.md – admin + shared GET list
- Swagger: `/api-docs` (local: `http://localhost:3000/api-docs`; live: `https://plusfive-backend.vercel.app/api-docs`)
