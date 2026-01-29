# Daily Development Report
**Date:** 29-01-2026  
**Project:** Plusfive Backend & Frontend

---

## ✅ Completed Tasks Summary

### 1. **Global Error Handling**
- ✅ `ErrorBoundary.jsx` (new): class component that catches JS errors in child tree; shows fallback UI with "Reload" instead of blank screen
- ✅ `App.jsx`: entire `<Routes>` wrapped with `ErrorBoundary` so any uncaught error on any route is handled gracefully

### 2. **Day-of-Week Constants (Consistency & Calendar)**
- ✅ `config/constants.js` (frontend) & `config/constants.js` (backend): standardised `DAYS_OF_WEEK` with `{ key: 'sunday', label: 'ראשון' }` and `DAYS_OF_WEEK_KEYS` for API keys
- ✅ Account settings: `SingleTabCard.jsx`, `BusinessProfileCard.jsx` use shared constants; `BusinessHoursTab.jsx` receives and uses them; dispatches `business-operating-hours-updated` on save
- ✅ Calendar: `StaffSummaryCard.jsx`, `BookingFlowPanel.jsx`, `staffAvailability.js`, `recurringEngine.js`, `useStaffTransformation.js` use `DAYS_OF_WEEK_KEYS` / day keys for API and labels for UI
- ✅ Calendar reflects business hours changes: `CalendarPage.jsx` refetches business hours with cache-bust on visibility/focus and on `business-operating-hours-updated`; `businessOperatingHoursService.jsx` uses query param `?_=Date.now()` (no cache headers to avoid CORS)

### 3. **Staff Services – Loader for POST/DELETE**
- ✅ `StaffSummaryCard.jsx`: `servicesActionLoading` state; loader shown for add/remove/update staff service (POST `/api/staff/:staffId/services`, DELETE `/api/staff/:staffId/services/:serviceId`)
- ✅ `CommonPanelLoader` overlay with "מעדכן שירות..." when `handleToggleStaffService` or `handleUpdateServiceField` (price/duration) is in progress; button and UI disabled during request

### 4. **Create Customer – Calendar vs Calendar-Clients**
- ✅ Calendar (`/app/calendar`): uses `NewClientModal` (calendar/Modals) + `useCustomerCreation` hook (controlled form)
- ✅ Calendar-clients (`/app/calendar-clients`): uses `NewClientModal` (calendarClients) with internal state and "העלאת לקוח חדש" title; has date of birth field

### 5. **Calendar "Add a new customer" – Date of Birth & Loader**
- ✅ `useCustomerCreation.js`: added `newClientBirthdate` state; `customerData` includes `birthdate` when provided; reset on success/error; returns `newClientBirthdate`, `setNewClientBirthdate`
- ✅ `calendar/Modals/NewClientModal.jsx`: "תאריך לידה" (date of birth) input added; props `newClientBirthdate`, `onBirthdateChange`
- ✅ `useCustomerCreation.js`: `isCreatingCustomer` state; set true before API call, false in `finally`; returned from hook
- ✅ `NewClientModal.jsx` (calendar): `CommonPanelLoader` with "יוצר לקוח..." when `isCreating`; submit button disabled and shows "יוצר..." during create
- ✅ `CalendarPage.jsx`: passes `newClientBirthdate`, `setNewClientBirthdate`, `isCreatingCustomer` (as `isCreating`) to `NewClientModal`

### 6. **Catalog – Categories & Keys**
- ✅ `NewProductModal.jsx`: removed static `CATEGORY_OPTIONS`; `availableCategories` from API only with dedupe by ID; safe fallbacks to avoid blank screen
- ✅ `CatalogCategoryListingModal.jsx`: unique keys for list (e.g. `key={category.id ?? \`cat-${index}-${title}\`}`) to avoid duplicate-key React warning

### 7. **Calendar Staff Page**
- ✅ `calendarStaff/index.jsx`: no auto-POST on tab open for working hours; default business hours applied to local state only until user saves (previous fix retained)

### 8. **Other Components**
- ✅ `BookingFlowPanel.jsx`: day keys/labels from constants for availability and display
- ✅ `ServiceSummaryCard.jsx`: alignment with shared patterns where applicable

---

## 📁 Files Modified / Added

### Backend
| File | Change |
|------|--------|
| `config/constants.js` | `DAYS_OF_WEEK` and `DAYS_OF_WEEK_KEYS` for consistent day keys (e.g. 'sunday') and Hebrew labels |

### Frontend – Modified
| File | Change |
|------|--------|
| `src/App.jsx` | Wrap `<Routes>` with `ErrorBoundary` |
| `src/components/accountSettings/BusinessProfileCard.jsx` | Use `DAYS_OF_WEEK` from config constants |
| `src/components/accountSettings/SingleTabCard.jsx` | Use `DAYS_OF_WEEK` from config constants |
| `src/components/accountSettings/tabs/BusinessHoursTab.jsx` | Use day constants; dispatch `business-operating-hours-updated` on save |
| `src/components/calendar/CalendarStaff/StaffSummaryCard.jsx` | `servicesActionLoading` + loader for POST/DELETE staff services; day keys from constants |
| `src/components/calendar/Modals/NewClientModal.jsx` | Date of birth field; `CommonPanelLoader` + `isCreating` for customer create |
| `src/components/calendar/Panels/BookingFlowPanel.jsx` | Day keys/labels from constants |
| `src/components/catalog/CatalogCategoryListingModal.jsx` | Unique keys for category list |
| `src/components/catalog/NewProductModal.jsx` | Dynamic categories only; dedupe; no static CATEGORY_OPTIONS |
| `src/components/services/ServiceSummaryCard.jsx` | Shared patterns / alignment |
| `src/config/constants.js` | `DAYS_OF_WEEK`, `DAYS_OF_WEEK_KEYS` |
| `src/hooks/calendar/useCustomerCreation.js` | `newClientBirthdate`, `isCreatingCustomer`; birthdate in API payload; loader state |
| `src/hooks/calendar/useStaffTransformation.js` | Use `DAYS_OF_WEEK_KEYS` for `todayKey` |
| `src/pages/calendar/CalendarPage.jsx` | Business hours refetch on visibility/event; NewClientModal birthdate + isCreating |
| `src/pages/calendarStaff/index.jsx` | No auto-save of working hours on tab open (local state only until save) |
| `src/redux/services/businessOperatingHoursService.jsx` | Cache-bust query param only (no Cache-Control/Pragma to avoid CORS) |
| `src/utils/calendar/recurringEngine.js` | Use `DAYS_OF_WEEK_KEYS` for day mapping |
| `src/utils/calendar/staffAvailability.js` | Use `DAYS_OF_WEEK_KEYS` for day key to number |

### Frontend – New (Untracked)
| Path | Description |
|------|-------------|
| `src/components/commonComponent/ErrorBoundary.jsx` | Global error boundary component |

---

## 🔧 Technical Improvements

### Code Quality
- ✅ Single source of truth for day-of-week keys (English) and labels (Hebrew) across frontend and backend
- ✅ Customer create flow on calendar has loader and date of birth aligned with calendar-clients UX

### User Experience
- ✅ No blank screen on uncaught errors (ErrorBoundary)
- ✅ Loader when creating customer on calendar ("יוצר לקוח...")
- ✅ Loader when adding/removing/updating staff services in StaffSummaryCard
- ✅ Calendar "Add a new customer" includes date of birth like calendar-clients

### Architecture
- ✅ Business hours refetch when calendar becomes visible or when account settings save (event-driven)
- ✅ Staff services API (POST/DELETE) loading state scoped to StaffSummaryCard overlay

---

## 🎯 Key Achievements

1. **Error boundary**: Any route error is caught and shows a reload option instead of a blank screen.
2. **Day constants**: Consistent `sunday`–`saturday` keys and Hebrew labels; calendar and account settings stay in sync.
3. **Loaders**: Customer create (calendar) and staff service add/remove/update show clear loading state.
4. **Calendar "Add customer"**: Same fields as calendar-clients (including date of birth) and create loader.

---

## 📊 Statistics

- **Backend files modified**: 1
- **Frontend files modified**: 18
- **Frontend new files**: 1 (ErrorBoundary.jsx)
- **Branch**: snehal

---

## 🔄 Next Steps (Optional)

1. Commit and push backend + frontend changes on branch `snehal` when ready.
2. Consider reusing one create-customer modal (e.g. calendar-clients style with birthdate) on both calendar and calendar-clients if product wants full parity.
3. Keep an eye on CORS if adding custom headers to business-operating-hours or other APIs.

---

## 📝 Notes

- **Git status**: All changes unstaged on branch `snehal` (frontend and backend).
- **Calendar**: Uses NewClientModal (calendar) + useCustomerCreation; calendar-clients uses its own NewClientModal with birthdate and loader.
- **Report scope**: Based on git status and session context.

---

## 🐛 Bugs Addressed

- Avoided blank screen on catalog/create product and duplicate React keys (categories) via dynamic categories and safe keys.
- Calendar no longer auto-POSTs working hours on calendar-staff tab open; only saves when user explicitly saves.
- CORS issue with cache headers on business-operating-hours fixed by using only query param for cache-busting.

---

**Report Generated:** 29-01-2026  
**Branch:** snehal
