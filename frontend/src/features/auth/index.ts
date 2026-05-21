/**
 * Public surface of the auth feature.
 * Maps to schema v2 module 01-platform-tenancy.
 */
export { useAuth } from './hooks/useAuth';
export { loginSchema, type LoginFormValues } from './schemas/loginSchema';
export { homeForRole, isSuperRole, hasRole, hasAnyRole, roleHas, userHas, type Capability } from './authTypes';
export type {
  UserProfile,
  DoctorProfile,
  ChiefDoctorProfile,
  FrontdeskProfile,
  PharmaProfile,
  InventoryProfile,
  LabRadioProfile,
  OwnerProfile,
  UserRole,
  AuthSession,
  Iso8601,
  Uuid,
} from './authTypes';
