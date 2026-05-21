/**
 * Doctor role shell — composes domain features into the doctor’s screens.
 *
 * Pure composition: no domain logic owned here. Domain state, types, APIs,
 * and components live in `features/<module>` mapped to schema v2 modules.
 * When pharmacist / labTech / billingClerk shells are added, they live as
 * sibling `apps/<role>` folders.
 */
export { doctorRoutes } from './doctorRoutes';
