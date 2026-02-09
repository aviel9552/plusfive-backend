# Daily Report – 09 February 2026

## Summary

Backend and frontend changes for the **snehal** branch: calendar recurring cancellation (this vs series), cancel-series API and UI (correct count, list with date/time/staff/service), removal of `selectedServices` from `appointments` table and all code, PATCH status restricted to future appointments only (same rule as frontend), toast on appointment note save, Prisma client regeneration fix for dropped column, and **calendar general-purpose behaviour** (full day visible, past dates selectable).

---

## Backend (plusfive-backend)

### 1. Appointments: remove `selectedServices` from schema and API
- **Modified:** `prisma/schema.prisma` – removed `selectedServices` from `Appointment` model
- **New migration:** `prisma/migrations/20260209180000_remove_appointments_selected_services/migration.sql` – `ALTER TABLE appointments DROP COLUMN IF EXISTS "selectedServices"`
- **Modified:** `controllers/webhookController.js` – no longer set or select `selectedServices` on appointments (create, update, findMany, findFirst, include); customer `selectedServices` (Customers table) unchanged
- **Modified:** `controllers/customerController.js` – last-appointment service from join with `services` table (`s.name`); appointment lists use `service` relation; `lastVisit` select includes `service: { name }`, `lastAppointmentService` from `lastVisit?.service?.name`; GET customer appointments include `service` for display
- **Note:** After deploying migration, run `npx prisma generate` (with backend stopped) so the client stops querying the dropped column.

### 2. PATCH appointment status: allow only future appointments
- **Modified:** `controllers/webhookController.js` – added `isPastAppointment(apt)` helper (same logic as frontend: past date, or same day with end time ≤ now). Before updating status: if appointment is past, return **400** with message *"Cannot change status of past appointments. Only future appointments can be updated."* For cancel series: only cancel appointments that are not past (filter booked series by `!isPastAppointment` before update).

### 3. Prisma client regeneration (fix for dropped column)
- **New:** `scripts/regenerate-prisma.bat` – runs `npx prisma generate` (run with backend stopped if EPERM)
- **New:** `PRISMA_REGENERATE.md` – short instructions to fix "column appointments.selectedServices does not exist"
- **Modified:** `package.json` – added script `"fix:prisma": "scripts\\regenerate-prisma.bat"`

### 4. Other backend (modified, not detailed above)
- **Modified:** `controllers/serviceController.js`
- **Modified:** `controllers/staffController.js`

---

## Frontend (plusfive-frontend)

### 1. Recurring cancel: this vs series + summary modal
- **Modified:** `src/components/calendar/Panels/AppointmentSummaryCard.jsx` – cancel flow: if recurring, show choice (this appointment only / entire series / back); single cancel: confirm modal. Edit button hidden for past appointments (`isPastAppointment`).
- **New:** `src/components/calendar/Modals/CancelledSeriesSummaryModal.jsx` – modal after cancelling series: title, cancelled count, list of cancelled appointments with date • time • staff • service, selected appointment details, close button.
- **Modified:** `src/pages/calendar/CalendarPage.jsx` – on cancel with `cancelScope: 'series'`, use `_cancelledCount` and `cancelledAppointments` from API; build `cancelledAppointmentsList` (dateLabel, timeLabel, staffName, serviceName); show modal or toast when count is 0 ("כל התורים בסדרה כבר בוטלו"); refetch appointments.

### 2. Remove appointment `selectedServices` usage
- **Modified:** `src/services/calendar/appointmentService.js` – map backend to frontend: service name only from `service` relation (no `selectedServices` fallback); map frontend to backend: do not send `selectedServices` in create/update payload.
- **Modified:** `src/components/calendar/Panels/ClientSummaryCard.jsx`, `src/components/calendarClients/ClientSummaryCard.jsx` – last appointment service from `lastAppointmentService` or `lastAppointmentDetails?.service?.name`; list items use `apt.service?.name` only.
- **Modified:** `src/pages/customerManagement/AppointmentsTab.jsx` – display `appointment.service?.name` or `customer.selectedServices`; last appointment from `lastAppointmentService` or `lastAppointmentDetails?.service?.name`.
- **Modified:** `src/components/admin/appointments/AdminAppointmentsTable.jsx` – service column uses `row?.service?.name` only.

### 3. Toast on appointment update (note save)
- **Modified:** `src/pages/calendar/CalendarPage.jsx` – in `handleSaveCustomerNote`, on success show `toast.success("הערה נשמרה בהצלחה")`; on error show `toast.error(...)` instead of `alert`.

### 4. Calendar general-purpose: show full day and allow past dates
- **Modified:** `src/components/calendar/CalendarGrid/TimeGrid.jsx` – removed auto-scroll to current time; on day view open or date change, scroll to top so the full day (including past hours) is visible. Past times are no longer hidden/collapsed.
- **Modified:** `src/components/calendar/CalendarHeader.jsx` – main calendar date picker (`CommonDatePicker`) now has `disablePastDays={false}` so users can select any date (including past) to view appointments for that date.

### 5. Other frontend (modified)
- **Modified:** `src/components/calendar/CalendarGrid/TimeGrid.jsx`, `TimeGridOverlays.jsx`
- **Modified:** `src/components/calendar/Modals/CustomerNoteModal.jsx`
- **Modified:** `src/hooks/calendar/useAppointments.js`, `useBookingFlow.js`, `useCustomerCreation.js`
- **Modified:** `src/components/commonComponent/CommonDatePicker.jsx`, `ErrorBoundary.jsx`
- **Modified:** `src/components/services/NewServiceModal.jsx`, `ServiceSummaryCard.jsx`
- **Modified:** `src/i18/en.json`, `src/i18/he.json`
- **Modified:** `src/pages/calendarStaff/index.jsx`, `src/pages/services/index.jsx`
- **Modified:** `src/utils/calendar/timeHelpers.js`

---

## Git status (at report time)

*Excluding `.history` and other non-project paths.*

### Backend – modified
- `controllers/customerController.js`
- `controllers/serviceController.js`
- `controllers/staffController.js`
- `controllers/webhookController.js`
- `prisma/schema.prisma`

### Backend – new (untracked)
- `scripts/regenerate-prisma.bat`
- `PRISMA_REGENERATE.md`
- `prisma/migrations/20260209180000_remove_appointments_selected_services/` (if not yet committed)

### Frontend – modified
- `src/components/admin/appointments/AdminAppointmentsTable.jsx`
- `src/components/calendar/CalendarHeader.jsx`
- `src/components/calendar/CalendarGrid/TimeGrid.jsx`
- `src/components/calendar/CalendarGrid/TimeGridOverlays.jsx`
- `src/components/calendar/Modals/CustomerNoteModal.jsx`
- `src/components/calendar/Panels/AppointmentSummaryCard.jsx`
- `src/components/calendar/Panels/ClientSummaryCard.jsx`
- `src/components/calendarClients/ClientSummaryCard.jsx`
- `src/components/commonComponent/CommonDatePicker.jsx`
- `src/components/commonComponent/ErrorBoundary.jsx`
- `src/components/services/NewServiceModal.jsx`
- `src/components/services/ServiceSummaryCard.jsx`
- `src/hooks/calendar/useAppointments.js`
- `src/hooks/calendar/useBookingFlow.js`
- `src/hooks/calendar/useCustomerCreation.js`
- `src/i18/en.json`
- `src/i18/he.json`
- `src/pages/calendar/CalendarPage.jsx`
- `src/pages/calendarStaff/index.jsx`
- `src/pages/customerManagement/AppointmentsTab.jsx`
- `src/pages/services/index.jsx`
- `src/services/calendar/appointmentService.js`
- `src/utils/calendar/timeHelpers.js`

### Frontend – new (untracked)
- `src/components/calendar/Modals/CancelledSeriesSummaryModal.jsx`

### Frontend – deleted
- *(None relevant; `.history` and other versioned copies excluded from this report.)*

---

## Deployment / next steps

1. **Backend:** Run migration for drop `appointments.selectedServices`:  
   `npx prisma migrate deploy` (or `prisma migrate dev` in dev).
2. **Backend:** Regenerate Prisma client: stop server, then `npx prisma generate` or `npm run fix:prisma`; restart server.
3. **Backend:** Deploy; ensure env (e.g. `DATABASE_URL`, `JWT_SECRET`) is set.
4. **Frontend:** Deploy after backend is live; ensure API base URL is correct.
5. **Optional:** Add `.history` to `.gitignore` to avoid committing history files.

---

## References

- `PRISMA_REGENERATE.md` – fix for "column appointments.selectedServices does not exist"
- `USER_API_ENDPOINTS.md` – business owner APIs
- `ADMIN_API_ENDPOINTS.md` – admin + shared GET list
- Swagger: `/api-docs` (local: `http://localhost:3000/api-docs`)
