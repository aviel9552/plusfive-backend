# Daily Report – 12 February 2026

## Summary

Backend and frontend changes for the **snehal** branch: conflict rules (cancelled appointments do not block; past appointments not updatable), calendar layout (staff bar alignment, RTL, time column spacer), shared **NewClientModal** (single component for calendar and calendar-clients), custom birthdate picker (past enabled, future disabled), and **booking flow fix** so that after creating a new customer the user is taken to the appointment summary (“קבע תור”) instead of staying on the client list.

---

## Backend (plusfive-backend)

### 1. Appointment conflict: exclude cancelled
- **Modified:** `controllers/webhookController.js` – when checking overlap for new single appointment, only non-cancelled appointments block (e.g. `appointmentStatus: { not: 'cancelled' }`). A new appointment can be created at the same slot if the existing one is cancelled.
- **Modified:** `lib/availabilityHelper.js` – recurring overlap check excludes cancelled (same filter). Comments clarified.

### 2. Past appointments not updatable
- **Modified:** `controllers/webhookController.js` – in `updateAppointment` (PUT), added past check (same day + end time in past, or date in past). If past, return **400** with message *"Past appointments cannot be updated."*

### 3. Other backend (modified)
- **Modified:** `controllers/webhookController.js` (overlap + past logic above)
- **Modified:** `lib/availabilityHelper.js` (recurring conflict exclude cancelled)

---

## Frontend (plusfive-frontend)

### 1. Shared NewClientModal (single source of truth)
- **New:** `src/components/commonComponent/NewClientModal.jsx` – one modal used by Calendar (controlled) and Calendar-clients (uncontrolled). Supports `onSubmit` + parent state (controlled) or internal state + Redux create (uncontrolled). Same UI: name, phone, email, city, address, birthdate with **CommonDatePicker** (שמור/נקה/היום), birthdate: past enabled, future disabled.
- **Modified:** `src/components/calendar/Modals/NewClientModal.jsx` – re-exports from `commonComponent/NewClientModal.jsx`.
- **Modified:** `src/components/calendarClients/NewClientModal.jsx` – thin wrapper that renders shared modal with uncontrolled props and title “העלאת לקוח חדש”. Change in one place applies to both flows.

### 2. Custom calendar for birthdate (Add new customer)
- **Modified:** `src/components/commonComponent/NewClientModal.jsx` – birthdate uses **CommonDatePicker** (month/year nav, Hebrew/English, pink highlight, Save/Clear/Today). `disablePastDays={false}`, `maxDate={new Date()}` so only past and today selectable for birthdate.

### 3. Birthdate picker: past enabled, future disabled (edit client)
- **Modified:** `src/components/calendarClients/ClientSummaryCard.jsx` – CommonDatePicker for birthdate when editing: `disablePastDays={false}`, `maxDate={new Date()}` so past days are selectable and future disabled.

### 4. Conflict checks: ignore cancelled (frontend)
- **Modified:** `src/utils/calendar/recurringEngine.js` – `checkRecurringConflicts` excludes cancelled (by `appointmentStatus` / `status`).
- **Modified:** `src/pages/calendar/CalendarPage.jsx` – added `isEventBlockingSlot(event)` (cancelled = not blocking). All conflict checks (date/time/duration change, apply, validate, waitlist duplicate) and recurring conflict use it so only non-cancelled block. After cancel (status → cancelled), always refetch appointments then show series modal or toast.

### 5. Booking flow: after new customer → appointment summary
- **Modified:** `src/pages/calendar/CalendarPage.jsx` – on new customer creation success: set selected client, close new-client modal, and call **handleFlowApply(newClient)** (via ref) so the **appointment summary** opens (client + date/time/service + “קבע תור”) and the booking panel closes. No longer stuck on client list.
- **Implementation:** `onNewClientCreatedRef` holds `handleFlowApply`; `useCustomerCreation` onSuccess calls `onNewClientCreatedRef.current(newClient)`; `useEffect` keeps ref updated.

### 6. Calendar layout (staff bar, time column, RTL)
- **Modified:** `src/components/calendar/CalendarStaffBar.jsx` – week view: position and spacer so day headers align with grid and leave space for time column (`w-[72px] sm:w-20`); `pl-1`; day view: same positioning and spacer, RTL support (`dir={isRTL ? "rtl" : "ltr"}`), grid alignment. Not full-width; respects sidebar/time column.
- **Modified:** `src/pages/calendar/CalendarPage.jsx` – passes `isRTL` to CalendarStaffBar.

### 7. Booking flow step log (debug)
- **Modified:** `src/components/calendar/Panels/BookingFlowPanel.jsx` – `useEffect` logs when `waitlistAddStep === "client"`: `[BookingFlow] step: client (Appointment summary – client + Schedule appointment)`.

### 8. Other frontend (modified)
- **Modified:** `src/components/calendar/CalendarGrid/TimeGrid.jsx`
- **Modified:** `src/components/calendar/Panels/AppointmentSummaryCard.jsx`
- **Modified:** `src/components/calendar/Panels/BookingFlowPanel.jsx`
- **Modified:** `src/components/layout/Sidebar.jsx`

---

## Git status (at report time)

*Branch: **snehal**.*

### Backend – modified
- `controllers/webhookController.js`
- `lib/availabilityHelper.js`

### Backend – new (untracked)
- *(None.)*

### Frontend – modified
- `src/components/calendar/CalendarGrid/TimeGrid.jsx`
- `src/components/calendar/CalendarStaffBar.jsx`
- `src/components/calendar/Modals/NewClientModal.jsx`
- `src/components/calendar/Panels/AppointmentSummaryCard.jsx`
- `src/components/calendar/Panels/BookingFlowPanel.jsx`
- `src/components/calendarClients/ClientSummaryCard.jsx`
- `src/components/calendarClients/NewClientModal.jsx`
- `src/components/layout/Sidebar.jsx`
- `src/pages/calendar/CalendarPage.jsx`
- `src/utils/calendar/recurringEngine.js`

### Frontend – new (untracked)
- `src/components/commonComponent/NewClientModal.jsx`

### Frontend – deleted
- *(None.)*

---

## Deployment / next steps

1. **Backend:** Deploy; ensure env (e.g. `DATABASE_URL`, `JWT_SECRET`) is set.
2. **Frontend:** Deploy after backend is live; ensure API base URL is correct.
3. **Optional:** Remove or reduce the `[BookingFlow]` console.log in `BookingFlowPanel.jsx` if no longer needed for debugging.

---

## References

- `USER_API_ENDPOINTS.md` – business owner APIs
- `ADMIN_API_ENDPOINTS.md` – admin + shared GET list
- Swagger: `/api-docs` (local: `http://localhost:3000/api-docs`)
