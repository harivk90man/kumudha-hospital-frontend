# Hospital Management System — Journey Flows

Plain-language flows for every role in the hospital. No technical terms. No database references.
Used as the source of truth for aligning the data model to real-world requirements.

---

## Patient Identity Model

Every patient in the system carries three identifiers:

| Identifier | Visible to patient | Format | Purpose |
|---|---|---|---|
| **UHID** | Yes | Configurable prefix + configurable-length zero-padded number (e.g., HOSP000001) | Hospital-issued patient-facing ID; printed on the patient card and on all documents (prescriptions, test slips, bills) |
| **Internal App ID** | No | System-generated UUID | Internal record linkage only; never shown to patient or staff |
| **Mobile number** | Yes | As provided | May be shared across family members — one mobile number can be linked to multiple patient records (e.g., father, mother, children) |

**UHID format** is configured once by the hospital admin at onboarding (prefix + number length). It cannot be changed after patients have been registered. See Admin Flow step 10.

**Mobile lookup rule:** Searching by mobile number may return multiple linked patients. Staff must always ask the patient's name after a mobile search and select the correct UHID from the list before proceeding.

**Search options available to all staff (receptionist, lab, pharmacy):** UHID (exact match, direct result) or mobile number (may return a list — disambiguate by name).

---

## 1. OPD — Outpatient Visit

> **STATUS: ✅ IN SCOPE — Phase 1**

> 🔒 **LOCKED** — This section is finalised and approved. No changes to be made without explicit re-approval from the owner.
> *(Amendments approved: Step 2 — UHID and mobile-number lookup with family-linking logic. Steps 17–18 and post-consultation branching — report-review fast-track queue, `doctor_review_pending` state, same-day / next-day return sub-flow, pharmacy decline path, and OP→IP transfer path.)*

**Actors:** Patient, Receptionist, Nurse, Doctor, Lab Technician, Pharmacist, Cashier

> **📚 Technical Spec — Tables touched:**
> [Patient Master](../05-tsd/03-patient-master.md) · [Patient Journey](../05-tsd/04-patient-journey.md) · [Appointments](../05-tsd/05-appointments.md) · [OPD Encounters](../05-tsd/06-opd-encounters.md) · [Clinical Consultation](../05-tsd/07-clinical-consultation.md) · [Lab](../05-tsd/08-lab.md) · [Radiology](../05-tsd/09-radiology.md) · [Pharmacy & Inventory](../05-tsd/10-pharmacy-inventory.md) · [Services & Pricing](../05-tsd/11-services-pricing.md) · [Billing & Invoicing](../05-tsd/12-billing-invoicing.md) · [Payments & Cash](../05-tsd/13-payments-cash.md) · [Audit & Notifications](../05-tsd/02-audit-events-notifications.md)

1. Patient arrives at the hospital reception counter
   > **Note:** If the patient only wants to book an appointment for a future date and does not need to see a doctor today, skip to the Walk-in Counter variant in Section 4.
2. Receptionist asks if the patient has visited before
   - **New patient** → Receptionist collects name, age, gender, contact number, address, blood group, allergies, and any known chronic conditions → Patient record is created → Patient is assigned a UHID and receives it on a patient card (UHID format is set by the hospital admin — see Admin Flow step 10)
   - **Returning patient** → Receptionist searches by UHID (direct lookup) or mobile number; if mobile search returns multiple linked patients (family members sharing a number), receptionist asks the patient's name and selects the correct record → confirms UHID with the patient
3. Receptionist selects the department and doctor the patient wants to see
4. Patient pays the consultation registration fee at the counter
5. Patient receives a token number and is directed to the pre-consultation nurse desk
6. Nurse records the patient's vitals: blood pressure, pulse, temperature, weight, and blood sugar if required
7. Receptionist or nurse enters a brief chief complaint in the system (e.g., fever, cold, headache, bone fracture) — this appears alongside the patient's token and vitals on the doctor's queue screen

   > **Visit Status:** From this point the patient carries a live visit status visible on both the receptionist's screen and the doctor's queue screen. Status transitions during the visit:
   > - **Waiting** — vitals and chief complaint recorded; patient is in the waiting area
   > - **With Doctor** — doctor has called the token; patient is in the consultation room
   > - **At Lab** — doctor ordered tests; patient has gone to the lab / radiology department
   > - **Awaiting Report Review** — all tests in the current round are reported; patient has been notified to return; visit stays open across shift boundaries and calendar days until the patient comes back
   > - **Consultation Complete** — doctor has closed the visit after reviewing results and finalising the prescription
   > - **Transferred to IP** — doctor initiated admission from this visit; visit closed as transferred, not completed

8. Patient waits in the waiting area *(status: **Waiting**)*
9. Doctor's screen shows the queue; each entry displays the token number, chief complaint, and latest vitals; doctor calls the next token *(status → **With Doctor**)*
10. Patient enters the doctor's room
11. Doctor opens the patient's profile and reviews full medical history organised date-wise (most recent first); doctor can click on any past visit date to expand it and see:
    - A chronological activity timeline for that visit (e.g., arrived at 09:00 → vitals recorded at 09:10 → seen by doctor at 10:00 → test samples collected at 10:30 → reports received at 11:15 → prescription finalised at 11:20 → medicines collected at 11:45)
    - Chief complaint on that date
    - Diagnosis made
    - All tests ordered on that visit and their individual reports — each test (blood report, X-ray image, ultrasound, ECG trace, echo, MRI/CT) has its own report file attached to that visit date; doctor can view or download each one directly
    - Prescription given (medicines, dosage, duration)
    - Doctor's notes / observations
    - Known allergies and chronic conditions are shown prominently at the top, not buried in the timeline
12. Doctor listens to the patient's current complaint
13. Doctor examines the patient
14. Doctor decides next action:
    - **Prescription only** → Doctor writes a prescription — while selecting each medicine the system shows its real-time pharmacy stock status (in stock / low stock / out of stock); doctor specifies dosage, duration, and instructions → Go to step 19
    - **Tests required** → Doctor orders one or more tests for this round (e.g., X-ray first; a blood test may be ordered separately after reviewing the X-ray result — tests do not have to be ordered all at once) → Go to step 15
    - **Both tests and prescription** → Doctor orders tests and also gives an initial or conditional prescription (stock status visible here too)
15. Patient takes the test order slip to the billing counter and pays for the ordered tests *(status → **At Lab**)*
16. Patient receives a payment receipt and proceeds to the Lab / Radiology department
17. Tests are conducted → reports prepared and uploaded to the system → **`doctor_review_pending` is triggered only when every test ordered in the current round is reported** — the system does not move to this state if even one result is still outstanding; once all results are in, the doctor is notified and the patient is notified to return *(status → **Awaiting Report Review**)*
    > **Same-day return:** Patient comes back the same day (e.g., morning tests, evening results) → checks in at reception → receptionist looks up the open visit by UHID → issues a **report review token** (fast-track lane, no consultation fee, vitals not re-recorded) → patient waits for the doctor to call from the report review queue
    > **Next-day or later return:** The visit remains open in `doctor_review_pending` across shift boundaries and calendar days — it does not auto-close at end of day. When the patient eventually returns, they check in at reception, UHID is looked up, and a fast-track report review token is issued at that point. Same rules apply: no fee, no vitals.
    > **Abandoned visit:** If the patient does not return within the configured threshold (hospital setting, default 14 days from when results were ready), an admin can manually close the visit as **Abandoned**. The prescription (if any was written before tests) remains `active` — patient can still fill it at the pharmacy using their UHID.
18. Doctor's console shows two queue sections side by side: **Consultation queue** (fresh patients with regular tokens) and **Report Review queue** (patients with `report_review` tokens). Doctor decides freely when to call from either lane — can interleave at any time. When a report review token is called: patient enters → `in_consultation (150)` → doctor reviews all results together, adjusts prescription if needed → `consultation_done (160)`
    > **Sequential test rounds:** After reviewing results, the doctor may order a further round of tests (e.g., ordered X-ray first; now orders a blood test based on the X-ray finding). If so, the doctor issues a new test order slip → patient repeats steps 15–18 for the new round → `doctor_review_pending` is set again only when all results of the new round are ready. Each round is paid separately at the billing counter. This loop can happen more than once within a single visit.
19. Doctor reviews results (if any) and finalises the prescription
20. Doctor records and locks the clinical notes for this visit — notes cover examination findings, observations, and clinical reasoning; once locked, notes are visible in the patient's date-wise history for all future visits; any post-closure amendment requires a written reason and the original note is preserved alongside the amendment
21. Doctor sets a follow-up date if needed and decides the next action:

    - **A — No tests ordered and no medicines prescribed** → Doctor closes the consultation → patient leaves *(status → **Consultation Complete**, code 600)*

    - **B — Medicines only (no tests ordered)** → Doctor writes prescription → patient proceeds to pharmacy (step 22) → visit closes after pharmacy step *(status → **Consultation Complete**, code 600)*

    - **C — Tests ordered, no medicines** → Patient goes to billing + lab (steps 15–18) → all results in → doctor reviews → doctor closes visit *(status → **Consultation Complete**, code 600)*

    - **D — Tests ordered and medicines** → Patient goes to billing + lab (steps 15–18) → all results in → doctor reviews and finalises prescription → patient proceeds to pharmacy (step 22) → visit closes after pharmacy step *(status → **Consultation Complete**, code 600)*

    - **E — Admit patient (OP → IP)** → Doctor clicks "Admit" → visit status moves to `ip_admission_recommended (620)` → receptionist / admission staff assigned a bed and opens the IP admission record linked to this visit → visit closes as **Transferred to IP** *(code 630)*; the full clinical history and all test results from this visit are automatically visible in the IP record *(see IPD Flow §2)*

22. Patient takes the prescription to the pharmacy counter
23. Pharmacist checks medicine availability and informs the patient of available medicines and the total cost
    - **Patient buys all medicines** → Patient pays the full pharmacy amount at the pharmacy counter → Pharmacist dispenses all medicines → Stock updated for dispensed items → visit closes *(status → **Consultation Complete**)*
    - **Patient buys only some medicines** → Patient selects which medicines to purchase → Pays for those items at the pharmacy counter → Pharmacist dispenses selected medicines and notes on the prescription which items were not purchased → Stock updated for dispensed items → visit closes *(status → **Consultation Complete**)*
    - **Patient declines all medicines** → Patient leaves without purchasing; prescription remains `active` (patient may fill it elsewhere or return later using their UHID) → visit closes immediately *(status → **Consultation Complete**)*
24. Patient leaves the hospital
    > **Note:** Each service is paid at its own counter — consultation fee at reception (step 4), test fees at the lab counter (step 15), pharmacy at the pharmacy counter (step 23). There is no separate final billing stop for OPD.

---

## 2. IPD — Inpatient Admission

> **STATUS: 🔴 OUT OF SCOPE — Phase 2 (Reference Architecture Only)**
> This flow is fully documented for design reference and Phase 2 planning. It is not built in v1. See [phase-breakdown.md](../00-overview/phase-breakdown.md).

**Actors:** Doctor, Nurse, Patient / Attendant, Admission Staff (Receptionist), Ward / Housekeeping Staff, OT Staff (surgery pathway only), Cashier, Pharmacist

> **📚 Technical Spec — Tables touched:**
> [phase-2/IPD Admissions, Wards, Discharge](../05-tsd/phase-2/15-ipd-admissions.md) *(Phase 2 stub)* · [phase-2/Surgery](../05-tsd/phase-2/16-surgery.md) *(Phase 2 stub)* · [Patient Master](../05-tsd/03-patient-master.md) · [Patient Journey](../05-tsd/04-patient-journey.md) · [Clinical Consultation](../05-tsd/07-clinical-consultation.md) · [Lab](../05-tsd/08-lab.md) · [Radiology](../05-tsd/09-radiology.md) · [Pharmacy & Inventory](../05-tsd/10-pharmacy-inventory.md) · [Billing & Invoicing](../05-tsd/12-billing-invoicing.md) · [Payments & Cash](../05-tsd/13-payments-cash.md)

> **Day Care:** A planned short-stay (same-day or overnight) procedure uses this exact same flow with an `is_day_care` flag. No separate flow is needed — day care patients follow every step below; the flag signals that discharge is expected the same day.

---

### A. Entry Points

Admission can be triggered from five sources — the entry point is recorded and the relevant prior record linked:

1. **OP → IP conversion** — doctor initiates admission from an open OPD visit; the OPD visit is linked to the admission so the full clinical history and test results carry forward automatically
2. **Direct IP admission** — walk-in or planned / elective admission with no prior OPD visit on the same day; new or returning patient
3. **Emergency → IP transfer** — admission triggered from the Emergency Flow; patient is already registered; deposit is collected at this point if not already taken
4. **Hospital transfer in** — patient referred from another hospital; referral letter and prior treatment summary captured at admission; a new IP number is issued
5. **Day care** — planned short-stay procedure; same flow with `is_day_care = true`; discharge expected on the same day or the following morning

---

### B. Admission

1. Admission source identified (one of the five above) and recorded
2. Patient identified by UHID (existing) or registered (new) — UHID is printed on all documents from this point forward (wristband, prescription, test slips, bill)
3. Admission details captured: reason for admission, provisional diagnosis, admitting doctor, expected duration, insurance / TPA details if applicable, MLC flag if this is a medico-legal case
4. **IP number generated** (e.g., IP-2026-00521) — unique human-readable identifier linked to the UHID; used as the primary reference for every event, record, and charge during the entire stay
5. **Ward / room / bed selection** — system shows only beds currently in **Ready for Allocation** status; ward type chosen (General / Semi-Private / Private / Deluxe / ICU / NICU / PICU); on confirmation, bed status immediately changes to **Occupied** and a bed assignment record opens with the exact admission timestamp (`from_ts`)
6. **Advance deposit collected** — amount based on the selected room type and the expected length of stay; recorded against the IP admission as the opening credit balance; this deposit is not a payment for any specific service — it sits as credit and is adjusted at final discharge
7. **Running bill opened** — every subsequent service (room charges, medications, tests, procedures, consumables) is automatically appended to this bill with no counter payment required during the stay; unlike OPD, the patient does not pay at each service point
8. Baseline vitals recorded by nurse — every entry is tagged with: UHID, IP admission ID, current bed assignment, date and time, nurse who recorded
9. Doctor's first assessment documented — provisional diagnosis confirmed or revised, initial treatment plan recorded, medication and monitoring orders placed

---

### C. Daily Inpatient Cycle (repeats each day of the stay)

1. Nursing shift starts — nurse reviews the previous shift's handover notes before attending to patients
2. **Morning vitals** recorded for each assigned patient: BP, pulse, temperature, SpO₂, respiratory rate, pain score — every entry is tagged with patient, IP admission ID, current bed assignment, timestamp, and recording nurse
3. **Medications administered** per the current active prescription — each dose is recorded with: medicine name, dose, route of administration, time given, nurse who administered, and current bed
4. **Doctor's ward round** — doctor reviews overnight vitals, latest test results, and nursing observations; updates the treatment plan if needed; clinical notes are recorded and locked after the round; nurse handover note updated with new instructions
5. **Tests ordered during rounds** — two billing modes depending on hospital configuration:
   - **Default — running-bill mode:** lab staff comes to the bedside to collect the sample (or patient is taken to the lab); the test charge is automatically added to the IP running bill with no counter payment; result flows back to the doctor's queue the same way as OPD results
   - **Counter-payment mode (configurable hospital-level toggle):** test requires payment at the lab counter before processing, same as the OPD model — use this if the hospital's lab operates as a separate billing entity
   - Every test result is linked to: UHID, IP admission ID, the bed assignment active at the time of the order, and the exact timestamp
6. **Evening vitals and medications** — same recording pattern as the morning
7. Any medications, consumables, or procedures that occur between rounds are recorded immediately and appended to the running bill with their timestamp and the current bed context
8. **Shift-end handover** — nurse prepares a handover summary: active monitoring needs, pending tasks, significant events during the shift; verbal handover to the incoming nurse and digitally recorded in the system

---

### D. Room Change (mid-stay)

A patient may be moved to a different room at any point — clinical need (isolation, step-up to ICU, step-down from ICU), patient / family upgrade or downgrade request, or ward rearrangement:

1. Ward-in-charge or doctor initiates the room change
2. **Target bed must be in Ready for Allocation** — the system blocks assignment to any bed that is Occupied, Vacated–Cleaning Pending, Reserved, or Out of Service
3. Transfer timestamp is recorded (date + time, to the minute)
4. **Old bed closes:** bed assignment record gets `to_ts = transfer_timestamp`; bed status automatically transitions to **Vacated – Cleaning Pending** — identical to the discharge lifecycle in §10; the bed is not available for new allocation until housekeeping marks it Ready
5. **New bed opens:** a new bed assignment record is created with `from_ts = transfer_timestamp`; bed status → **Occupied**
6. **Room charge pro-ration on the transfer day:**
   - Old room charge for that day = (hours spent in old room ÷ 24) × old room daily rate
   - New room charge for that day = (hours spent in new room on that day ÷ 24) × new room daily rate
   - Both appear as separate line items on the bill with their exact from/to timestamps so the bill is transparent and auditable
7. All vitals, medications, tests, and events from the transfer timestamp onwards are tagged to the new bed assignment
8. The patient or attendant can view the current accumulated bill at any time — room charges across all rooms to date, tests, medications, procedures, deposit paid, outstanding balance

---

### E. Interim Payment (during stay)

1. Attendant can request a **bill preview** at any time — the system shows: room charges broken down by each room period and rate, lab / radiology tests, medications, procedures, advance deposit applied, any earlier interim payments, and the current outstanding balance
2. Attendant can make a **partial payment** at the cashier counter at any point during the stay — amount, timestamp, and payment method are recorded against the IP admission; the outstanding balance reduces immediately
3. **Deposit top-up** is allowed if accumulated charges are approaching or exceeding the initial deposit and the attendant wishes to maintain a positive balance
4. All interim and top-up payments are credited and clearly shown in the final settlement at discharge — nothing is double-counted

---

### F. Surgery Pathway (only for patients who undergo surgery — not all IPD patients follow this)

1. Doctor schedules the surgery: OT room, date and time, surgery type, primary surgeon, anesthetist, and the full team (scrub nurse, circulating nurse, assistants)
2. Nurse completes the **pre-op checklist**: pre-op vitals recorded, anaesthesia consent signed, fasting status confirmed, surgical site marked, IV access secured, allergies and implant details verified
3. Patient is moved from the ward bed to the OT holding area
4. **Ward bed status → Reserved** — the bed is held for the patient's return; it is not available to other patients but is not released; cleaning is not triggered
5. **OT room status → In Use**; surgery start time recorded
6. Surgery is performed — the following are recorded during and immediately after: procedure details, actual start and end times, team members and their roles, all consumables used (medicines, sutures, implants, materials — each with quantity and unit cost), complications if any, surgeon's operative notes
7. All OT-related costs are **automatically added to the running bill** with precise timestamps: OT room usage charge, surgeon's fee, anesthetist's fee, each consumable as a separate line item
8. Surgery end time recorded; **OT room status → Cleaning → Available** (OT has its own status lifecycle parallel to ward beds)
9. Patient moves to the **recovery area** — a recovery bay or room is assigned; a bed assignment is opened if the recovery room is tracked as a distinct bed type; recovery nurse records post-anaesthesia observations and vitals
10. Once the doctor clears the patient from recovery:
    - **Return to ward:** patient goes back to the original ward bed (status: Reserved → **Occupied**); no new bed assignment needed — the existing one resumes
    - **Transfer to ICU / HDU** (if condition requires): original ward bed assignment closes (`to_ts` filled); ward bed → **Vacated – Cleaning Pending**; new ICU bed assignment opens
11. Post-op care resumes under the daily cycle (section C): vitals, medications, wound management, all tagged to the current bed and IP admission

---

### G. Discharge

When the doctor decides the patient is medically ready to go home, the flow hands off to **Discharge Flow (§10)** with the following IPD-specific context:

- Final room charge is **pro-rated to the actual discharge hour** — a patient discharged at 10 am is not charged a full day for the final day; the same pro-ration formula as room change applies
- Current bed status transitions to **Vacated – Cleaning Pending** (as defined in §10)
- All running bill items are consolidated into the final bill
- Advance deposit and all interim payments already collected are adjusted against the final total before the patient is asked to pay any balance

---

### H. Data Linkages (every record carries these fields)

Every clinical entry and every billing line item is tagged with the following so that any question about the patient's stay can be answered precisely:

| Field | What it enables |
|---|---|
| UHID | Patient identity across every record |
| IP Admission ID (IP number) | Groups everything for this stay |
| Bed Assignment ID | Which room / bed the patient was in at the time of each event |
| Timestamp (date + time) | Pro-ration of room charges; audit trail; sequence of care |
| Recorded-by user | Staff accountability |

This linkage answers questions like: "how long did this patient stay in Room 204 and what did it cost?", "what were the vitals at 6 pm on day 3?", "what is the current invoice total right now?", and "which nurse administered the 8 pm dose on Tuesday?"

---

## 3. Emergency Flow

> **STATUS: 🔴 OUT OF SCOPE — Phase 2 (Reference Architecture Only)**
> This flow is documented for design reference and Phase 2 planning. It is not built in v1. See [phase-breakdown.md](../00-overview/phase-breakdown.md).

**Actors:** Patient / Attendant, Triage Nurse, Emergency Doctor, Receptionist, Nurse, Lab Technician, Pharmacist, Cashier

> **📚 Technical Spec — Tables touched:**
> [phase-2/IPD Admissions](../05-tsd/phase-2/15-ipd-admissions.md) *(Phase 2 stub — emergency entry shares IPD entry-point)* · [Patient Master](../05-tsd/03-patient-master.md) · [Patient Journey](../05-tsd/04-patient-journey.md) · [OPD Encounters](../05-tsd/06-opd-encounters.md) *(emergency creates op_visits with `is_emergency=TRUE`)* · [Clinical Consultation](../05-tsd/07-clinical-consultation.md) · [Lab](../05-tsd/08-lab.md) · [Radiology](../05-tsd/09-radiology.md) · [Pharmacy & Inventory](../05-tsd/10-pharmacy-inventory.md)

1. Patient arrives at the emergency entrance (by ambulance, walk-in, or brought by someone)
2. Triage nurse immediately assesses the severity of the condition
   - **Critical** → Patient taken to emergency room immediately, treatment starts before any paperwork
   - **Serious but stable** → Patient moved to emergency bay, attendant begins registration at counter
   - **Mild / Non-emergency** → Patient redirected to OPD queue
3. Emergency doctor begins treatment — stabilise the patient first
4. Attendant or receptionist registers the patient while treatment is underway (name, contact, what happened)
5. Doctor orders emergency tests if needed (blood group, blood count, X-ray, ECG, etc.)
6. Lab and radiology conduct urgent tests → Results rushed back to doctor
7. Doctor reviews results and continues treatment
8. Doctor decides next step:
   - **Admit to ward or ICU** → Go to IPD Flow from step 4
   - **Procedure / Surgery needed** → OT booked, follow IPD surgical path
   - **Stable, safe to discharge** → Doctor writes prescription → Patient goes to pharmacy → Billing done → Patient leaves
9. All emergency treatments, medicines, and tests are added to the patient's bill
10. Before the patient leaves or is transferred, billing is completed (or a deposit is taken for IPD)

---

## 4. Appointment Booking Flow (Online / Phone / Walk-in at Counter)

> **STATUS: ✅ IN SCOPE — Phase 1**

**Actors:** Patient, Receptionist (phone / counter) / Patient (online portal or app)

> **📚 Technical Spec — Tables touched:**
> [Patient Master](../05-tsd/03-patient-master.md) · [Appointments](../05-tsd/05-appointments.md) *(slots, appointments, tokens)* · [Audit & Notifications](../05-tsd/02-audit-events-notifications.md) *(reminders, no-show alerts)*

### Walk-in at Counter

1. Patient arrives at the reception counter and tells the receptionist they want to book a future appointment (not a same-day visit)
2. Receptionist asks if the patient has visited before
   - **New patient** → Basic details collected (name, contact number, age, gender); full registration is completed on arrival on the appointment day
   - **Returning patient** → Identified by UHID (direct lookup) or mobile number; if mobile returns multiple linked patients, receptionist asks the patient's name and selects the correct record
3. Receptionist asks which department or doctor the patient wants to see
4. Receptionist opens the doctor's calendar for the chosen date — the calendar shows all time slots (generated from the doctor's configured OPD schedule and slot duration) and highlights which are already booked vs available
5. Patient selects a preferred date and an available time slot
6. Receptionist assigns the slot — it is immediately blocked in the doctor's calendar so no other patient can book the same slot
7. Appointment is confirmed in the system; patient receives a confirmation slip with: doctor name, date, assigned time slot (e.g., 10:30 AM), and token number — tokens are numbered in FIFO booking order for that date, so earlier bookings get a lower token number and an earlier time slot
8. Patient is advised to arrive at least 15 minutes before their assigned slot time
9. A reminder is sent to the patient one day before and a few hours before the appointment (SMS or phone call)
10. Patient leaves the hospital — no consultation today; their slot and token are already reserved for the appointment date
11. On the appointment day, patient arrives near their slot time → Receptionist checks them in against the booking → Consultation fee is paid → patient proceeds to nurse vitals check (OPD Flow from step 6); their pre-assigned token is already in the doctor's queue

---

### App (Patient Self-Service)

1. Patient opens the hospital app and logs in using their UHID or registered mobile number
   - **New patient** → Patient registers in the app with basic details (name, mobile number, age, gender); full registration is completed at the hospital on arrival
2. Patient selects the department or doctor they want to see
3. Patient sees the doctor's calendar showing available time slots for the chosen date (already-booked slots are not shown)
4. Patient selects a preferred date and an available time slot — the slot is immediately blocked so no other patient can take it
5. Appointment is confirmed; patient receives a confirmation notification (SMS / app) with: doctor name, date, assigned time slot (e.g., 10:30 AM), and token number (FIFO — earlier bookings get a lower token and an earlier slot)
6. Patient is reminded to arrive at least 15 minutes before their assigned slot time
7. A reminder is sent one day before and a few hours before the appointment
8. Patient arrives at the hospital near their slot time → Receptionist checks them in → Consultation fee is paid → patient proceeds to nurse vitals check (OPD Flow from step 6); their pre-assigned token is already in the doctor's queue

---

### Phone (Via Receptionist)

1. Patient calls the hospital helpline
2. Receptionist asks for the patient's UHID or registered mobile number to identify them
   - **Found** → Patient record is pulled up; receptionist confirms the patient's name before proceeding
   - **Not found / New patient** → Receptionist collects basic details (name, mobile number, age, gender); full registration is completed at the hospital on arrival
3. Receptionist asks which department or doctor the patient wants to see
4. Receptionist opens the doctor's calendar for the chosen date and reads out available time slots to the patient
5. Patient selects a preferred date and time slot; receptionist books it — the slot is immediately blocked in the doctor's calendar
6. Patient receives a confirmation SMS with: doctor name, date, assigned time slot, and token number (FIFO)
7. Patient is advised to arrive at least 15 minutes before their assigned slot time
8. A reminder is sent one day before and a few hours before the appointment
9. Patient arrives at the hospital near their slot time → Receptionist checks them in → Consultation fee is paid → patient proceeds to nurse vitals check (OPD Flow from step 6); their pre-assigned token is already in the doctor's queue

---

### Cancellation

**Who can cancel:** Patient (via phone, walk-in at counter, or app / website)

1. Patient requests a cancellation by one of three channels:
   - **Phone** → Patient calls the hospital helpline and provides their name, Patient ID, and appointment details (date, doctor, time slot); receptionist locates the booking and cancels it
   - **Walk-in at counter** → Patient comes to the reception counter; receptionist locates the booking by Patient ID or phone number and cancels it
   - **App / website** → Patient logs in, opens their upcoming appointments, and cancels directly
2. The system immediately frees the cancelled time slot — it becomes available for new bookings by any other patient (walk-in, phone, or online); no other existing patient's slot is moved or changed
3. The cancelled patient receives a confirmation of the cancellation (SMS / email / app notification) with the cancelled appointment details
4. No refund is needed — consultation fee is only collected at the hospital on the day of the visit, so no payment was made at the time of booking
5. The doctor's calendar reflects the freed slot immediately — the slot shows as available and can be rebooked
6. If the cancellation happens on the same day as the appointment and no new patient fills the slot, the slot remains empty in the doctor's queue for that day; existing patients in the same day's queue are not shifted

### No-Show

**Scenario:** Patient booked an appointment, received confirmation and token, but does not arrive at the hospital on the appointment day without cancelling.

1. On the appointment day, if a patient has not checked in at reception within 15 minutes past their assigned slot time, the system flags the booking as a potential no-show and alerts the receptionist
2. Receptionist attempts to reach the patient — one call or a system-triggered SMS asking if they are on their way
3. If the patient does not respond or confirm they are coming, the receptionist marks the booking as **No-Show** in the system
4. The token is removed from the doctor's queue — the doctor's screen no longer shows that patient for the day; the doctor proceeds to the next patient in the queue without any gap in their workflow
5. The slot is considered expired — it is not re-opened for new bookings (the appointment time has passed); if the no-show is detected early enough in the day and sufficient time remains in the slot, the receptionist may manually offer it to a same-day walk-in patient at their discretion
6. The patient receives a notification (SMS / app) informing them they were marked as a no-show for the appointment and that they can rebook if needed
7. No penalty is applied in Phase 1 — the patient is free to rebook a new appointment through any of the three booking channels (walk-in, phone, or app)

### Late Arrival

**Scenario:** Patient has a booked appointment but arrives after their assigned slot time without having cancelled.

1. Patient arrives at reception and presents their appointment confirmation; receptionist sees the slot time has already passed and marks the booking as **Late Arrival**
2. Receptionist checks the current state of the doctor's queue — it may already be full from on-time patients and same-day walk-ins regardless of how late the patient is
3. Receptionist checks with the doctor whether there is capacity to accommodate the patient today
   - **Doctor cannot accommodate** → Receptionist informs the patient and offers a rebook for the next available slot; patient leaves and a new appointment is created through the standard booking flow
   - **Doctor can accommodate** → go to step 4
4. Patient is added to the **end of the doctor's queue** by default — they do not regain their original token position; a *Late Arrival* label is shown on both the receptionist's and doctor's screens so both are aware
5. If the receptionist or doctor wishes to move the patient higher in the queue (e.g., elderly patient, long travel distance, urgent-looking complaint), they can manually reposition the patient to any position including the top — this is a deliberate override, not the default
6. Patient proceeds to the nurse desk for vitals check and waits to be called
7. Consultation proceeds normally once the doctor calls them

---

## 5. Doctor Flow

> **STATUS: ✅ IN SCOPE — Phase 1**

**Actors:** Doctor, Patient, Nurse, Lab Technician

> **📚 Technical Spec — Tables touched:**
> [Patient Master](../05-tsd/03-patient-master.md) · [Patient Journey](../05-tsd/04-patient-journey.md) *(doctor's queue is `awaiting_doctor` / `awaiting_report_review`)* · [OPD Encounters](../05-tsd/06-opd-encounters.md) · [Clinical Consultation](../05-tsd/07-clinical-consultation.md) *(vitals, consultations, prescriptions, drafts, recommendations)* · [Lab](../05-tsd/08-lab.md) · [Radiology](../05-tsd/09-radiology.md) · [Pharmacy & Inventory](../05-tsd/10-pharmacy-inventory.md) *(stock-status read at prescribing)* · [Audit & Notifications](../05-tsd/02-audit-events-notifications.md) *(Reports Ready inbox)*

1. Doctor arrives and logs into their dashboard
2. Doctor sees today's appointment screen split into two sections:
   - **Scheduled patients** — fresh patients ordered by slot time; each row shows token number, slot time, chief complaint, and vitals recorded by the nurse; status is *Waiting*
   - **Reports Ready** — patients from the same day who went for tests and whose results are now uploaded; shown separately with a *Reports Ready* badge so the doctor knows this is a post-test review, not a fresh consultation; each row shows the patient's name, token, and which tests are ready to review
3. Doctor calls the next patient
4. Doctor opens the patient's full medical history organised date-wise (most recent first); doctor can click on any past visit date to expand it and see:
   - A chronological activity timeline for that visit (e.g., arrived at 09:00 → vitals recorded at 09:10 → seen by doctor at 10:00 → test samples collected at 10:30 → reports received at 11:15 → prescription finalised at 11:20 → medicines collected at 11:45)
   - Chief complaint on that date
   - Diagnosis made
   - All tests ordered on that visit and their individual reports — each test (blood report, X-ray image, ultrasound, ECG trace, echo, MRI/CT) has its own report file attached to that visit date; doctor can view or download each one directly
   - Prescription given (medicines, dosage, duration)
   - Consulting doctor's notes
   - Known allergies and chronic conditions (e.g., diabetes, hypertension) are pinned at the top of the profile, always visible regardless of which visit date is open
   > **Viewing linked patients mid-consultation:** The doctor's consultation screen shows all patients registered under the same mobile number as the current patient (e.g., if the patient is the father, the doctor can see the mother and children linked to the same number). If a family member present in the room asks the doctor to check another patient's record (e.g., a child's vaccination history), the doctor opens that linked patient's profile in a new tab. All draft notes and in-progress prescription for the current patient remain intact in the original tab. Switching tabs does not affect either patient's record.
5. Doctor listens to the patient's current complaint and asks follow-up questions
6. Doctor examines the patient
7. Doctor records running clinical notes throughout the consultation — symptoms observed, examination findings, and clinical reasoning; notes are saved as a draft against this visit date and are not yet visible in the patient's history until they are locked at consultation closure; draft notes remain visible to the doctor throughout the session, including when the patient returns from the lab
8. Doctor optionally selects a **Consultation Template** before writing the prescription or ordering tests:
   - A template is a pre-configured set of recommended medicines (with default dosage and duration) and / or recommended tests, created by the doctor for a condition they see frequently (e.g., "Fever", "Hypertension Follow-up", "Diabetes Review", "Common Cold")
   - Selecting a template pre-fills the prescription and test order fields — doctor reviews all pre-filled items and can add, remove, or change anything before proceeding; nothing is applied without doctor confirmation
   - **Stock check on template load:** as soon as a template is applied, every medicine in it is checked against the current pharmacy inventory; medicines that are out of stock are highlighted in red with a warning label; medicines with low stock are highlighted in amber — doctor sees these indicators immediately before confirming the template, so they can substitute or remove unavailable medicines upfront
   - Templates are private to the doctor who created them; hospital admin can also create shared hospital-wide templates visible to all doctors
   - Template management (create, edit, delete) is available from the doctor's settings / profile section
9. Doctor decides on treatment:
   - **Medicines only** → Doctor writes the prescription (template pre-fill may already be loaded); to add or amend a medicine — whether starting from scratch or editing a template — the doctor opens a **medicine picker panel** with the following behaviour:
     - Displays the full hospital medicine catalogue in a paginated list (server-side pagination — medicines load in pages, not all at once)
     - Each column is independently sortable server-side: medicine name, generic name, category (e.g., antibiotic, analgesic, antacid, antidiabetic), form (tablet / capsule / syrup / injection / drops / ointment), manufacturer, stock status
     - Multi-column server-side filtering: doctor can apply filters on any combination of columns simultaneously (e.g., category = "antibiotic" AND form = "tablet") — results update without loading the full list
     - Stock status is visible as a column in the list (in stock / low stock / out of stock) so the doctor sees availability while browsing
     - Doctor selects a medicine → specifies dosage, frequency (e.g., twice a day), duration (e.g., 5 days), and any special instructions (e.g., after food); selected medicine is added to the prescription
   - **Tests needed** → Doctor selects which tests to order (blood test, urine test, X-ray, MRI, etc.) and notes the clinical reason; tests can be ordered in rounds — e.g., X-ray first, then a blood test after reviewing the X-ray result
   - **Both** → Prescription written using the medicine picker (with stock status visible) and tests ordered
   - **Referral to specialist** → Doctor refers the patient to another department or doctor
10. If tests were ordered, doctor issues the test order slip and waits for results; the patient pays and goes to lab / radiology (see OPD Flow steps 15–18)
11. When test results are uploaded and the patient returns (status: *Reports Ready*), the doctor's consultation screen shows both in the same view:
    - The draft notes written earlier in this session (symptoms, examination findings recorded before the patient went for tests) — so the doctor can refer to what they observed before seeing the results
    - All uploaded test reports for this round (each viewable and downloadable directly in the same screen)
12. Doctor cross-references the earlier notes with the test results and updates or confirms the prescription
13. Doctor sets a follow-up date if the patient needs to return
14. Doctor reviews and locks the clinical notes for this visit — locked notes are immutable and immediately visible in the patient's date-wise history; any post-closure amendment requires a written reason and the original note is preserved alongside it for the audit trail
15. Doctor marks the consultation as complete and calls the next patient
16. **For IPD patients** → Doctor does ward rounds: visits each admitted patient, reviews overnight notes from nurses, checks test results, updates medications or treatment plan, writes today's notes

---

## 6. Nurse / Ward Flow

> **STATUS: 🔴 OUT OF SCOPE — Phase 2 (Reference Architecture Only)**
> This flow is documented for design reference and Phase 2 planning. It is not built in v1. See [phase-breakdown.md](../00-overview/phase-breakdown.md).

**Actors:** Nurse, Patient, Doctor

> **📚 Technical Spec — Tables touched:**
> [phase-2/IPD Admissions, Wards, Discharge](../05-tsd/phase-2/15-ipd-admissions.md) *(Phase 2 stub — covers `nursing_notes`, `medication_administrations`, `shift_handovers`, `patient_handover_notes`)* · [Clinical Consultation](../05-tsd/07-clinical-consultation.md) *(`vitals` capture)*

1. Nurse starts their shift and reviews the handover notes from the previous shift
2. Nurse checks the list of patients assigned to their ward
3. For each patient, nurse checks the current orders: medications to give, vitals to record, procedures to assist with
4. Nurse visits each patient and records vitals (blood pressure, pulse, temperature, oxygen saturation, blood sugar if required)
5. Nurse administers medications as per the doctor's prescription at the correct times
6. If a patient's condition changes or they have a complaint, nurse notifies the doctor
7. Nurse assists doctor during ward rounds — carries notes, answers questions about the patient's overnight status
8. Nurse carries out any new instructions the doctor gives during rounds (new medications, change in dose, preparation for a procedure)
9. Nurse records all actions taken throughout the shift (medications given, vitals, observations)
10. At the end of the shift, nurse prepares a handover summary for the next shift nurse:
    - Which patients need close monitoring
    - Any pending tasks or new doctor orders
    - Any unusual events during the shift
11. Handover is communicated verbally and recorded so the next nurse has full context

---

## 7. Lab & Radiology Flow

> **STATUS: ✅ IN SCOPE — Phase 1** (OPD lab only; IPD lab billing is Phase 2)

> **Reference:** For the full list of supported blood and urine tests (Phase 1), including result fields, units, and reference ranges, see [Blood Test Catalogues](../02-catalogues/blood-test-catalogues.md).

> **IPD lab billing:** For admitted patients, test charges are automatically added to the IP running bill — no counter payment is required (see IPD Flow §2-C step 5). This is a hospital-level configurable toggle; when switched to counter-payment mode, IPD patients must pay at the lab counter before the test is processed, identical to the OPD model below.

**Actors:** Doctor, Patient, Lab Technician / Radiologist

> **📚 Technical Spec — Tables touched:**
> [Patient Master](../05-tsd/03-patient-master.md) · [Lab](../05-tsd/08-lab.md) *(`lab_tests`, `lab_orders`, `lab_samples`, `lab_results` with verified / override release)* · [Radiology](../05-tsd/09-radiology.md) *(`radiology_procedures`, `radiology_orders`, `radiology_studies`, `radiology_reports`)* · [Services & Pricing](../05-tsd/11-services-pricing.md) *(payment-before-service via `service_billing_policies`)* · [Billing & Invoicing](../05-tsd/12-billing-invoicing.md) · [Payments & Cash](../05-tsd/13-payments-cash.md) · [Audit & Notifications](../05-tsd/02-audit-events-notifications.md) *(critical-result alerts, file attachments)*

> **Note:** This flow covers OPD patients only. IPD lab flow (bedside sample collection, ward billing) will be planned separately.

1. Doctor orders one or more tests for a patient
2. Patient receives the test order slip
3. Patient goes to the billing counter and pays for the ordered tests; patient receives a payment receipt specifying which tests have been paid for
4. Patient presents the test order slip and payment receipt at the lab / radiology counter
5. Lab technician or radiologist verifies the payment receipt before doing anything — each test on the order slip must have a corresponding paid entry on the receipt; if any test has not been paid for, the patient is sent back to the billing counter before that test is started; no test is conducted without confirmed payment
6. Lab staff identifies the patient by UHID (printed on the test order slip) or mobile number; if mobile search returns multiple linked patients, staff asks the patient's name and selects the correct record before proceeding
7. Lab staff checks what tests are to be conducted
8. The system generates a unique **Sample / Test ID** for each test ordered — this ID is printed on the sample label and used to track the sample from collection through processing to result entry; no two tests share the same ID even within the same visit
9. For each test, sample is collected or test is conducted:
   - **Blood / Urine test** → Lab technician collects the sample → Labels the tube / container with the Sample ID, patient UHID, and test name → Sample sent to the lab bench for processing
   - **X-ray** → Patient goes to the X-ray room → Radiographer positions the patient and takes the image; image tagged with patient UHID and Test ID
   - **Ultrasound** → Patient positioned → Sonographer conducts the scan; images tagged with UHID and Test ID
   - **ECG** → ECG leads attached to the patient → Trace recorded and saved digitally; tagged with UHID and Test ID
   - **Echo (Echocardiogram)** → Patient positioned → Sonographer / cardiographer conducts the echo scan using ultrasound probe; images and measurements captured; tagged with UHID and Test ID
   - **MRI / CT Scan** → Patient is prepared (metal objects removed, contrast injection if needed) → Scan is taken; images tagged with UHID and Test ID
10. **Sample rejection (blood / urine only):** If during processing a sample is found to be unsuitable:
    - Lab technician marks the sample as **Rejected** in the system with the reason (e.g., hemolyzed, insufficient volume, wrong tube, contaminated)
    - Patient is notified (SMS or counter call) to return to the lab for recollection
    - A fresh sample is collected → a new Sample / Test ID is generated → reprocessed from step 9
    - The rejected sample ID, reason, and timestamp are recorded against the visit for audit purposes
11. Tests are processed / images are reviewed
12. Lab technician or radiologist prepares the report for each test; how the result is recorded differs per test type:
    - **Blood / urine test** → technician types result values into the system (each field from the test catalogue); optionally attaches one or more scanned report files (PDF / image)
    - **X-ray** → radiologist uploads one or more image files (e.g., frontal + lateral as separate files); typed findings field filled in
    - **Ultrasound** → sonographer uploads one or more image files; written report typed or attached
    - **ECG** → technician uploads the ECG trace file (PDF / image); typed findings alongside
    - **Echo (Echocardiogram)** → technician uploads report PDF and any image / video captures; multiple files supported
    - **MRI / CT Scan** → radiologist uploads image files (individual slices or as a set); written report typed or uploaded as PDF
    > **File upload:** Any number of files per test; no count limit. Stored against the specific test within the patient's visit date. Supported formats: JPG, PNG, PDF, DICOM.
    > **Notes / Impressions:** Every test has a free-text notes field for clinical impression, sample observations, or any relevant comment (e.g., "Impression: No acute cardiopulmonary abnormality"; "Sample slightly hemolyzed — recommend retest"). Visible to doctor and patient alongside results and files.
13. Senior lab technician or pathologist reviews the prepared report before it is released:
    - **Satisfactory** → reviewer marks it as **Verified** and releases it — this stores the result in the patient's record and triggers notifications
    - **Correction needed** → reviewer sends it back to the technician with comments → technician corrects and resubmits for review
    - **Critically abnormal value found during review** → reviewer immediately alerts the doctor by phone before completing the formal release (step 19)
    - **Reviewer unavailable (e.g., on leave):** Two options —
      - *Preferred:* Admin or the senior designates a temporary reviewer before going on leave; the temporary reviewer has the same sign-off rights and the flow continues normally
      - *Fallback override:* If no designated reviewer is available, the lab technician can publish the report using an **Override Release** — the system requires a mandatory reason before allowing this (e.g., "Verbal approval obtained from Dr. Ravi at 11:30 — senior on leave"); the report is published but flagged as *Override Released* so the senior can log in and formally verify it retrospectively when back; the override reason, technician name, and timestamp are permanently recorded against the result for audit purposes
14. Lab technician marks the verified result as **Released** in the system — this release action triggers automatic notifications to the doctor and the patient
15. Each released test result (typed values + attached files + notes) is stored against the patient's visit date and the specific test — tests within the same visit are grouped by date but each test is individually accessible
16. Doctor is notified that results are ready and can open the patient's record, navigate to the visit date, and view or download each individual test report
17. Patient is notified that their reports are available; patient can log in to the patient portal / app, go to their visit history, select the visit date, and view or download each individual report
18. Doctor opens the results, reviews each report, and proceeds with diagnosis
19. If a result is critically abnormal, lab staff immediately alerts the doctor by phone — this may happen during review (step 13) before the formal release

---

## 8. Pharmacy Flow

> **STATUS: ✅ IN SCOPE — Phase 1**

**Actors:** Doctor, Patient, Pharmacist, Store / Purchase Staff

> **📚 Technical Spec — Tables touched:**
> [Patient Master](../05-tsd/03-patient-master.md) · [Pharmacy & Inventory](../05-tsd/10-pharmacy-inventory.md) *(`vendors`, `medicines`, `medicine_batches`, `purchase_orders`, `pharmacy_sales`, `pharmacy_returns`, `narcotic_register`, `stock_movements`)* · [Services & Pricing](../05-tsd/11-services-pricing.md) · [Billing & Invoicing](../05-tsd/12-billing-invoicing.md) · [Payments & Cash](../05-tsd/13-payments-cash.md) · [Clinical Consultation](../05-tsd/07-clinical-consultation.md) *(prescription source)*

1. Patient brings a prescription to the pharmacy counter (from OPD or printed from the system); pharmacist identifies the patient by UHID (printed on the prescription) or mobile number — if mobile search returns multiple linked patients, pharmacist asks the patient's name and selects the correct record before proceeding
2. Pharmacist reads the prescription: which medicines, what dosage, how many days' supply
3. Pharmacist checks stock availability for each medicine and informs the patient of what is available and the total cost
   - **All medicines available** → Pharmacist states the total amount; patient decides to buy all
   - **Some medicines out of stock** → Pharmacist informs the patient of what is available and what is not; patient decides which available items to purchase; pharmacist notes unpurchased items on the prescription
   - **All medicines out of stock** → Pharmacist informs the patient; patient sources medicines elsewhere; flow ends here
   - **Expired stock guard:** The system automatically excludes expired batches from available stock — expired medicines cannot be added to the bill or dispensed under any circumstances, even if physically present on the shelf; if the only available batch of a medicine is expired, the system treats it as out of stock
4. Patient pays the pharmacy bill directly at the pharmacy counter (pharmacy items only — consultation fee was paid at reception; test fees were paid at the lab counter)
5. Pharmacist verifies the expiry dates of medicines to be dispensed (system also blocks dispensing of any expired batch as a final safeguard at the point of sale)
6. Pharmacist packs and labels the medicines clearly (patient name, medicine name, dosage instructions)
7. Pharmacist hands over the medicines to the patient and explains how to take each one
8. Stock levels are updated — quantity is deducted from inventory only at this point, after medicines are physically handed over; stock is never reduced before payment
9. **Stock replenishment:**
   - When a medicine's stock falls below a minimum level, pharmacy staff raises a purchase request listing the medicines and required quantities
   - Purchase staff reviews the request and approves it (or sends it back with comments for correction); on approval, purchase staff creates a purchase order against the chosen supplier and sends it to the supplier
   - When medicines are received, stock is updated with the new batch, quantity, and expiry date (received quantities are reconciled against the purchase order before the batch is taken into stock)
   - Medicines nearing expiry are flagged for priority use or return to supplier
   - **Expired batch handling:** Once a batch crosses its expiry date, the system automatically marks it as expired and blocks it from being sold or dispensed — expired stock is segregated for return to supplier or disposal and is never available at the billing screen
   - **Vendor payment return (credit note):** If a purchase order was paid in advance and the vendor cannot deliver (stock unavailability, product discontinued, or any other reason), the vendor returns the payment. This return is recorded in the system as a **vendor credit note** against the original PO with the following fields captured: vendor name, original PO reference, returned amount, date of return, reason (free-text, mandatory — cannot be saved without a reason), and the staff member who recorded it. The credit note reduces the outstanding payable for that vendor and appears in the owner's daily transactions view as a clearly labelled credit return.

---

## 9. Billing Flow

> **STATUS: ✅ IN SCOPE — Phase 1**

**Actors:** Patient, Receptionist, Cashier, Doctor, Lab Staff, Pharmacist

> **📚 Technical Spec — Tables touched:**
> [Services & Pricing](../05-tsd/11-services-pricing.md) · [Billing & Invoicing](../05-tsd/12-billing-invoicing.md) *(`invoices` with Layer 2 maker-checker for discount approval; `invoice_items`; `credit_notes`)* · [Payments & Cash](../05-tsd/13-payments-cash.md) · [Audit & Notifications](../05-tsd/02-audit-events-notifications.md) *(discount approval audit, mandatory reasons)*

1. A bill is opened for the patient as soon as they register (OPD) or are admitted (IPD)
2. Every service the patient receives automatically adds a charge to their bill:
   - Registration / consultation fee (at reception)
   - Each test ordered (at lab / radiology)
   - Bed charges per day (for IPD)
   - Procedure or surgery charges (if applicable)
   - Pharmacy items (medicines and supplies)
3. Patient or attendant can ask for a bill preview at any point
4. When the patient is ready to leave (OPD) or is being discharged (IPD), the cashier opens the final bill
5. Cashier reviews all the line items with the patient
6. Cashier applies any approved discounts. Discounts can be given two ways and in two forms:
   - **Scope:**
     - *Line-item discount* — applied to a specific charge (e.g., ₹100 off a specific test, 10% off one medicine)
     - *Whole-bill discount* — applied on the bill subtotal after all line items are added
   - **Type:** Either a **percentage** (e.g., 10%) or a **flat amount** (e.g., ₹500) — cashier chooses per discount
   - **Mandatory reason / category:** Every discount requires a reason from a defined list — senior citizen, staff, camp, corporate / TPA tie-up, charity, management approval, special case (with free-text note), etc. — this drives reporting and audit
   - **Approval limits:** Cashier can apply discounts up to a configured threshold (e.g., 10% or ₹500) on their own; anything above requires admin / manager approval before the discount is accepted by the system
   - **Stacking rule:** If both line-item and whole-bill discounts are applied, line-item discounts are computed first; the whole-bill discount is then applied on the already-discounted subtotal (prevents accidental double-discounting)
   - **Guardrails:** A discount can never exceed the line-item amount or the bill total (no negative balances); items flagged as non-discountable (e.g., implant pass-through cost, insurance-covered portion, external lab charges) are blocked from receiving any discount
   - **Audit trail:** Who applied each discount, when, the reason, and the original vs final amount are permanently recorded against the bill and shown on the printed receipt
7. If the patient has insurance:
   - Insurance-covered items are separated
   - Patient pays only their co-pay or the non-covered portion → Insurance claim is filed separately (see Insurance Flow)
8. Patient pays the remaining amount (cash, card, UPI, or bank transfer)
9. If the patient cannot pay in full:
   - Partial payment is accepted
   - Remaining balance is noted as due
10. Receipt is generated and given to the patient
11. Cashier closes the bill and the patient is cleared to leave

---

## 10. Discharge Flow

> **STATUS: 🔴 OUT OF SCOPE — Phase 2 (Reference Architecture Only)**
> This flow is documented for design reference and Phase 2 planning. It is not built in v1. See [phase-breakdown.md](../00-overview/phase-breakdown.md).

**Actors:** Doctor, Nurse, Cashier, Pharmacist, Ward Staff, Patient / Attendant

> **📚 Technical Spec — Tables touched:**
> [phase-2/IPD Admissions, Wards, Discharge](../05-tsd/phase-2/15-ipd-admissions.md) *(Phase 2 stub — covers `discharge_summaries`, bed lifecycle, `interim_bills`)* · [Billing & Invoicing](../05-tsd/12-billing-invoicing.md) *(IP_FINAL invoice)* · [Payments & Cash](../05-tsd/13-payments-cash.md) *(deposit adjustment)*

1. Doctor decides the patient is medically ready to go home
2. Doctor writes the discharge summary:
   - Final diagnosis
   - Summary of treatment given during the stay
   - Condition at the time of discharge
   - Medicines to continue at home (discharge prescription)
   - Instructions and restrictions (diet, activity, wound care)
   - Follow-up appointment date
3. Nurse completes the discharge checklist:
   - All pending medications administered
   - IV lines, catheters, or other equipment removed
   - Patient and family given education on home care
4. Billing department is notified to prepare the final consolidated bill (all charges from the entire stay)
5. Cashier presents the final bill to the patient or attendant
6. Any advance deposit paid at admission is adjusted against the bill
7. Patient pays the remaining balance (or receives a refund if the deposit exceeded the bill)
8. Pharmacy provides the discharge medicines
9. Patient receives:
   - Discharge summary (physical copy and/or digital)
   - Discharge prescription
   - All original test reports and imaging files
   - Receipt of payment
10. **Bed status transitions through a defined lifecycle** — the bed is not made available for the next patient instantly:
    - **Occupied** → bed is in use by the discharging patient until the discharge is fully closed (bill cleared, patient physically leaves)
    - **Vacated – Cleaning Pending** → set automatically the moment the discharge is closed; the bed is empty but **not available for allocation** in this state — the system blocks new admissions or transfers from being assigned to a bed in this state, even if the ward shows it as physically empty
    - **Ready for Allocation** → ward / housekeeping staff marks the bed as ready after cleaning, linen change, and disinfection are complete; only then does the bed become selectable for the next admission or transfer
11. Ward staff cleans and prepares the bed; on completion, they update the status to **Ready for Allocation** in the system (timestamp and staff name recorded for audit / turnaround time reporting)
12. **Other bed states the system supports** (outside the normal discharge path):
    - **Reserved** → bed has been pre-allocated to a planned admission (e.g., scheduled surgery patient arriving later); shown as unavailable to other admissions
    - **Out of Service / Under Maintenance** → bed is not usable due to repair, deep cleaning after isolation case, or equipment fault; admin or ward in-charge sets and clears this state with a reason

---

## 11. Insurance / TPA Flow

> **STATUS: 🔴 OUT OF SCOPE — Phase 2 (Reference Architecture Only)**
> Currently classified as Phase 2. May be moved to Phase 3 — decision deferred. Not built in v1. See [phase-breakdown.md](../00-overview/phase-breakdown.md).

**Actors:** Patient, Receptionist, Insurance Desk Staff, Doctor, Cashier, Insurance Company / TPA

> **📚 Technical Spec — Tables touched:**
> *(No dedicated Phase 2 stub yet — TSDs will be authored when Insurance / TPA enters scope.)* Anticipated touches: [Patient Master §4.2 `patient_govt_ids`](../05-tsd/03-patient-master.md#42-patient_govt_ids) *(Aadhaar / PAN required for cashless TPA pre-auth)* · [Billing & Invoicing](../05-tsd/12-billing-invoicing.md) *(`insurance_covered_amount`, `patient_copay_amount` placeholders)* · [Payments & Cash](../05-tsd/13-payments-cash.md) *(`payee_type='insurance'` placeholder)*

1. Patient informs the hospital at registration that they have health insurance
2. Receptionist or insurance desk verifies the insurance card details (company, policy number, validity, coverage limits)
3. **For planned admissions or expensive procedures:**
   - Hospital sends a pre-authorisation request to the insurance company describing the planned treatment and estimated cost
   - Insurance company reviews and responds:
     - **Approved** → Treatment proceeds; approved amount is noted
     - **Partially approved** → Patient informed of the shortfall; patient agrees to pay the difference
     - **Rejected** → Patient pays out of pocket or chooses an alternative
4. Treatment is carried out
5. At discharge, all bills are compiled
6. Insurance desk separates covered charges from non-covered charges
7. Patient pays the non-covered portion (co-pay, deductibles, items not in policy)
8. Hospital files the insurance claim with all supporting documents (discharge summary, bills, test reports, prescriptions)
9. Insurance company reviews the claim:
   - **Approved** → Insurance pays the hospital directly
   - **Query raised** → Hospital provides additional documents
   - **Rejected** → Hospital informs patient; patient is billed for the full amount
10. Claim is settled and the bill is marked as fully paid

---

## 12. Hospital Owner Flow

> **STATUS: ✅ IN SCOPE — Phase 1**

**Actors:** Hospital Owner (and any Admin Manager the owner delegates to within the hospital)

> **📚 Technical Spec — Tables touched:**
> [Platform & Tenancy](../05-tsd/01-platform-tenancy.md) *(`tenants`, `users`, `system_config` with Layer 2 maker-checker, `doctor_profiles`, `tenant_holidays`)* · [Reports & Analytics](../05-tsd/14-reports-analytics.md) *(`revenue_targets`, `alert_rules`, all materialized views)* · [Audit & Notifications](../05-tsd/02-audit-events-notifications.md) *(approval queue, alerts dashboard)* · Read-only consumer of every transactional TSD ([03 Patient](../05-tsd/03-patient-master.md), [05 Appointments](../05-tsd/05-appointments.md), [06 OPD Encounters](../05-tsd/06-opd-encounters.md), [08 Lab](../05-tsd/08-lab.md), [09 Radiology](../05-tsd/09-radiology.md), [10 Pharmacy & Inventory](../05-tsd/10-pharmacy-inventory.md), [12 Billing & Invoicing](../05-tsd/12-billing-invoicing.md), [13 Payments & Cash](../05-tsd/13-payments-cash.md))

> **Role boundary:** The Hospital Owner is the tenant-level administrator — full control within their hospital, no visibility into other hospitals or vendor-level system configuration. Vendor-level access is a separate role (see §13 Platform Admin Flow).

---

### A. Daily Dashboard

1. Owner opens the dashboard at the start of the day

2. **Revenue overview:**
   - Owner can switch the revenue view to any custom date range using a date range picker at the top of the section; all figures — collections by source, outstanding, and overdue — update to reflect the selected period; quick presets available: Today (default), Yesterday, This Week, Last Week, This Month, Last Month, custom range
   - Total collections for the selected period with comparison to the equivalent prior period (e.g., if "This Month" is selected, comparison shows last month)
   - Breakdown by source: OPD consultations, IPD bed charges, lab & radiology, pharmacy, procedures
   - Total outstanding across all currently admitted IPD patients (running bills not yet settled)
   - Pending unpaid OPD bills older than a configured number of days
   - Cash session status for today: open / closed / variance flagged (if a cashier's session closed with a mismatch it appears here for owner action)

3. **Daily transactions:**
   - Every payment received today: patient name, amount, payment method, purpose
   - Expenses paid today: medicines purchased, supplies, salaries, utilities
   - Vendor credit notes received today (payment returns from suppliers) — each shown with vendor name, original PO reference, amount, and the mandatory return reason note; clearly labelled as credit returns so the owner can identify them at a glance and distinguish them from regular revenue
   - Net income for the day (money in minus money out)

4. **Staff presence:**
   - Who checked in today and at what time
   - Who is absent or on leave
   - Which doctors are on duty today and their schedules

5. **Patient activity:**
   - Number of OPD patients seen today
   - Number of patients currently admitted (IPD census)
   - Number admitted and discharged today
   - **Bed status breakdown:** count of beds in each state — Occupied / Vacated–Cleaning Pending / Ready for Allocation / Reserved / Out of Service (not just a single occupancy rate)
   - Average bed turnaround time today (time from Vacated–Cleaning Pending → Ready for Allocation)

6. **Department-wise summary:**
   - Revenue and patient count broken down by department
   - Lab tests conducted today and pending
   - Pharmacy sales for the day

7. **Alerts and flags:**
   - Medicines running low on stock
   - Medicines nearing expiry
   - Unpaid bills beyond the configured overdue threshold
   - Pending insurance claims awaiting action
   - **Pending discount approvals** — discounts submitted by cashiers that exceed their approval limit and are waiting for owner / manager sign-off
   - **Open report-review visits** — OPD visits in `doctor_review_pending` with days elapsed; patients who have not returned for result review; allows staff to call and follow up before the abandoned threshold is hit
   - **Pending purchase orders** — stock replenishment requests awaiting purchase staff action or owner approval (if above the configured PO threshold)
   - **SLA breach count** — number of patients who waited beyond the configured SLA at each station today (e.g., 3 patients waited >20 min for doctor, 1 discharge pending >60 min); broken down by department

8. **Reports:**
   - Weekly, monthly, or custom date range
   - Exportable for accounting or audits

---

### B. Approvals

The owner can action any approval in the system directly. They also configure the **approval matrix** — who else is authorised to approve what, so the owner does not have to approve every item themselves:

1. **Discount approvals:**
   - Cashier submits a discount that exceeds their self-approval limit → appears in the owner's (or designated approver's) queue
   - Owner reviews: patient name, line item or bill total, discount amount and reason → Approves or rejects with a note
   - **Approval matrix config:** Owner sets the threshold tiers — e.g., "0–10%: cashier self-approves; 10–25%: Admin Manager approves; above 25%: Owner only" — and assigns a named person or role to each tier

2. **Purchase order approvals:**
   - Purchase requests above a configured amount require owner (or designated approver) sign-off before the PO is sent to the supplier
   - **Approval matrix config:** Owner sets the PO value threshold and assigns the approver

3. **Refund approvals:**
   - Refunds above a configured amount require approval
   - **Approval matrix config:** Owner assigns the refund approver (e.g., Cashier Supervisor)

4. **General rule:** The owner can assign any approval type to a specific staff member by name or by role. Assignments are changeable at any time. The owner always retains the right to approve anything regardless of the matrix.

---

### C. Hospital Configuration

1. **Staff user management:**
   - Create staff accounts (receptionist, nurse, doctor, lab technician, pharmacist, cashier, etc.)
   - Assign roles to staff (role determines which screens and actions are accessible)
   - Deactivate accounts when staff leave; deactivated accounts cannot log in but their historical records are preserved
   - Reset staff passwords

2. **Doctor Schedule & Slot Configuration:**
   - Set a hospital-wide default consultation slot duration (e.g., 15 minutes per patient)
   - Override slot duration per doctor (e.g., specialist gets 30 min slots)
   - Set each doctor's OPD schedule: days of week, start time, end time, recurring breaks (e.g., lunch 13:00–14:00)
   - System auto-generates available time slots from schedule + slot duration
   - Block specific dates for a doctor (leave, holiday, conference) — existing bookings on blocked dates are flagged and patients notified to rebook
   - Slot duration changes take effect from the next working day; confirmed appointments are not affected

3. **Service pricing:**
   - Set and update consultation fees, room rates, procedure charges, lab test fees
   - Price changes take effect from the date set; existing open bills honour the price at the time of service (no retroactive repricing)

4. **Configurable thresholds:**
   - Cashier self-approval discount limit
   - Purchase order approval threshold
   - Overdue bill alert threshold (days)
   - Abandoned visit threshold (days in `doctor_review_pending` before flagged as abandoned; default 14)
   - SLA targets per station (used for breach alerts)

5. **Department setup:**
   - Add or rename departments; assign doctors and staff to departments

6. **Hospital Identity Configuration (one-time at onboarding):**
   - Set the UHID prefix (e.g., "HOSP", "KH", "APL") — prepended to every patient UHID
   - Set the UHID number length (e.g., 6 digits → HOSP000001, HOSP000002 …)
   - Cannot be changed after patients have been registered — changing it would create ID conflicts with existing patient cards
   - The internal App ID is system-generated and never configurable or visible outside the system

---

## 13. Platform Admin Flow

> **STATUS: ✅ IN SCOPE — Phase 1**

**Actors:** Application support team (vendor)

> **📚 Technical Spec — Tables touched:**
> [Platform & Tenancy](../05-tsd/01-platform-tenancy.md) *(cross-tenant access; `tenants`, `system_config`, `users`, `roles`, `permissions`)* · [Audit & Notifications](../05-tsd/02-audit-events-notifications.md) *(cross-tenant audit log access)* · [Patient Master §4.5 `uhid_sequences`](../05-tsd/03-patient-master.md#45-uhid_sequences) *(UHID config unlock)* · Master data lookups across all TSDs

> **Role boundary:** The Platform Admin is the vendor-level super user. This role crosses hospital (tenant) boundaries and has access to system-level configuration that hospital staff never see or touch. Hospital owners cannot access this role.

1. **Tenant management:**
   - Create a new hospital tenant (triggers onboarding: UHID config, first owner account, module access)
   - Enable or disable modules per tenant (e.g., enable Surgery module when a hospital upgrades)
   - Manage subscription / plan per tenant
   - **Encounter ID format configuration (per-tenant, set during onboarding):**
     - **OPD visit ID format** — prefix (e.g., "OP", "OPD", or a hospital-chosen code) + optional year segment (YYYY or YY) + zero-padded sequence length (e.g., 5 digits → OP-2026-00001); set once before any OPD visits are created for the tenant; cannot be changed after visits exist (same lock rule as UHID)
     - **IP admission number format** — prefix (e.g., "IP", "IPD") + optional year segment + zero-padded sequence length (e.g., 5 digits → IP-2026-00001); same lock rule applies
     - In exceptional circumstances (e.g., typo before any records are created), the platform admin can unlock and reset the format — same exception process as the UHID unlock in §12.C.6

2. **Master data management (shared across all hospitals):**
   - Medicine catalogue: add new medicines, generic names, INN codes, GST HSN codes, formulations
   - Lab test catalogue: add new tests, result fields, units, reference ranges by gender
   - ICD-10 code updates
   - Surgery type catalogue (Phase 2)
   - Radiology procedure catalogue

3. **Support operations:**
   - Audit log access (read-only, cross-tenant) for support investigations
   - Unlock UHID configuration for a tenant in exceptional circumstances (e.g., hospital made a typo before any patients were registered)
   - Reset password for a hospital owner account locked out of the system
   - Investigate data integrity issues; run approved corrections via stored procedures only (no direct table edits)

4. **System configuration:**
   - Feature flags per tenant
   - System-wide defaults (e.g., default SLA values, default abandoned visit threshold) that tenants inherit unless they override

5. **System health:**
   - Monitor database, run migrations, manage schema upgrades
   - Deployment and release management
