/**
 * Public surface of the appointments feature.
 */
export {
  fetchBookableDoctors,
  fetchSlots,
  fetchAppointmentsPaged,
  bookAppointment,
  checkInAppointment,
  cancelAppointment,
  payAppointment,
  markNoShow,
  markLateArrival,
} from './appointmentsApi';
export type { PayAppointmentResult } from './appointmentsApi';
export type {
  AppointmentSlot,
  SlotStatus,
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  VisitType,
  BookAppointmentInput,
  SlotsListParams,
  AppointmentsListParams,
} from './appointmentsTypes';
