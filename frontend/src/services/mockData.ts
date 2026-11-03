// Officer roster (application configuration, not incident records).
// No incidents or readings are seeded: the app starts empty and shows only
// records created by users or imported from files.
import type { Officer } from '@/types';
import { DEPARTMENTS } from '@/config/constants';

export const OFFICERS: Officer[] = [
  { id: 'off-ak', name: 'Aarav Kulkarni', department: DEPARTMENTS[1], zone: 'North Zone', phone: '+91 90000 00101', badge: 'FO-1021' },
  { id: 'off-ns', name: 'Neha Sharma', department: DEPARTMENTS[0], zone: 'Central Zone', phone: '+91 90000 00102', badge: 'FO-1034' },
  { id: 'off-rv', name: 'Rohan Verma', department: DEPARTMENTS[2], zone: 'East Zone', phone: '+91 90000 00103', badge: 'FO-1047' },
  { id: 'off-pm', name: 'Priya Menon', department: DEPARTMENTS[4], zone: 'South Zone', phone: '+91 90000 00104', badge: 'FO-1052' },
  { id: 'off-ik', name: 'Imran Khan', department: DEPARTMENTS[3], zone: 'Central Zone', phone: '+91 90000 00105', badge: 'FO-1066' },
  { id: 'off-sd', name: 'Sana D’Souza', department: DEPARTMENTS[0], zone: 'North Zone', phone: '+91 90000 00106', badge: 'FO-1071' },
];

/** Device-local citizen id used for "My complaints" (demo convenience, not authentication). */
export const DEMO_REPORTER_ID = 'citizen-demo';
