/* HMS Schema v8 — module manifest. AI: edit this when adding/removing/renaming a module. */
const MANIFEST = [
  // Platform layer (shared infrastructure)
  { id:'platform-tenancy',       name:'Platform · Tenancy',       color:'#9B7EE8', file:'modules/01-platform-tenancy.html',       tableCount:13, fieldCount:126, featureCount:7 },
  { id:'platform-audit',         name:'Platform · Audit',         color:'#7E6BC8', file:'modules/02-platform-audit.html',         tableCount:2,  fieldCount:19,  featureCount:2 },
  { id:'platform-events',        name:'Platform · Events',        color:'#6E5BB8', file:'modules/03-platform-events.html',        tableCount:1,  fieldCount:9,   featureCount:1 },
  { id:'platform-notifications', name:'Platform · Notifications', color:'#8E7BD8', file:'modules/04-platform-notifications.html', tableCount:2,  fieldCount:22,  featureCount:2 },
  { id:'platform-attachments',   name:'Platform · Attachments',   color:'#7B6BC0', file:'modules/05-platform-attachments.html',   tableCount:2,  fieldCount:27,  featureCount:2 },
  { id:'platform-lookups',       name:'Platform · Lookups',       color:'#A090E0', file:'modules/06-platform-lookups.html',       tableCount:2,  fieldCount:19,  featureCount:1 },
  // Feature layer (business bounded contexts)
  { id:'patient',                name:'Patient',                  color:'#5BA3D8', file:'modules/07-patient.html',                tableCount:6,  fieldCount:88,  featureCount:5 },
  { id:'journey',                name:'Journey',                  color:'#C49B5B', file:'modules/08-journey.html',                tableCount:3,  fieldCount:37,  featureCount:3 },
  { id:'appointments',           name:'Appointments',             color:'#378ADD', file:'modules/09-appointments.html',           tableCount:3,  fieldCount:53,  featureCount:3 },
  { id:'encounter',              name:'Encounter',                color:'#2A8E9E', file:'modules/10-encounter.html',              tableCount:2,  fieldCount:38,  featureCount:2 },
  { id:'consultation',           name:'Consultation',             color:'#1D9E75', file:'modules/11-consultation.html',           tableCount:7,  fieldCount:108, featureCount:6 },
  { id:'lab',                    name:'Lab',                      color:'#639922', file:'modules/12-lab.html',                    tableCount:6,  fieldCount:85,  featureCount:4 },
  { id:'radiology',              name:'Radiology',                color:'#3B8B55', file:'modules/13-radiology.html',              tableCount:4,  fieldCount:62,  featureCount:4 },
  { id:'inventory',              name:'Inventory',                color:'#B86F8E', file:'modules/14-inventory.html',              tableCount:7,  fieldCount:114, featureCount:6 },
  { id:'pharmacy',               name:'Pharmacy',                 color:'#D4537E', file:'modules/15-pharmacy.html',               tableCount:4,  fieldCount:68,  featureCount:2 },
  { id:'pricing',                name:'Pricing',                  color:'#BA7517', file:'modules/16-pricing.html',                tableCount:3,  fieldCount:34,  featureCount:3 },
  { id:'billing',                name:'Billing',                  color:'#E59332', file:'modules/17-billing.html',                tableCount:3,  fieldCount:79,  featureCount:3 },
  { id:'payments',               name:'Payments',                 color:'#D8951F', file:'modules/18-payments.html',               tableCount:13, fieldCount:122, featureCount:6 },
  { id:'analytics',              name:'Analytics',                color:'#7868D8', file:'modules/19-analytics.html',              tableCount:9,  fieldCount:80,  featureCount:4 },
];
