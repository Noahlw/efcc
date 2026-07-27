// EFCC shared TypeScript interfaces
// Consumed by Tasks 2-6; do not break the contract shape without a Spec update.

export type Role = "ADMIN" | "STAFF" | "EVENT_LEADER" | "MEMBER";

export interface User {
  userId: string;
  username: string;
  name: string;
  phone?: string;
  address?: string;
  role: Role;
}

export interface Program {
  programId: string;
  title: string;
  description?: string;
  type?: string;
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
}

export interface Enrollment {
  enrollmentId: string;
  userId: string;
  programId: string;
  enrolledAt: string;
  status: "ACTIVE" | "CANCELLED";
}

export interface ProgramWithEnrollment extends Program {
  isEnrolled: boolean;
}

export interface Event {
  eventId: string;
  programId: string;
  programName?: string;
  eventName: string;
  eventDate: string;
  timeSlot: string;
  eventType: "REGULAR" | "SPECIAL";
  recurrence: "NONE" | "WEEKLY" | "MONTHLY";
  status: "ACTIVE" | "CANCELLED";
  createdBy?: string;
  createdAt?: string;
}

export interface Attendance {
  attendanceId: string;
  eventId: string;
  userId: string;
  checkInTime: string;
  checkInMethod: "QR" | "MANUAL";
  checkInBy: string;
  status: "PRESENT" | "DUPLICATE";
}

export interface AttendanceEntry {
  attendanceId: string;
  eventId: string;
  userId: string;
  userName: string;
  checkInTime: string;
  checkInMethod: "QR" | "MANUAL";
  checkInBy: string;
}

export interface ActivityProfile {
  userId: string;
  name: string;
  phone?: string;
  lastCheckInAt?: string;
  totalCheckIns: number;
  enrolledPrograms: Program[];
  attendance: Attendance[];
}

export interface CareDashboardData {
  generatedAt: string;
  thresholdDays: number;
  inactiveMembers: ActivityProfile[];
}

export interface RegisterPayload {
  username: string;
  name: string;
  pin: string;
  phone?: string;
  address?: string;
}
export interface CreateEventPayload {
  programId: string;
  eventName: string;
  eventDate: string;
  timeSlot: string;
  eventType: "REGULAR" | "SPECIAL";
  recurrence: "NONE" | "WEEKLY" | "MONTHLY";
  createdBy: string;
}

export interface CancelEventPayload {
  eventId: string;
  cancelledBy: string;
}

export interface CheckInPayload {
  eventId: string;
  userId: string;
  method: "QR" | "MANUAL";
  staffId: string;
  sessionToken: string;
}

// =============================================================================
// Response envelopes
// =============================================================================

export interface LoginResponse {
  success: boolean;
  data?: {
    userId: string;
    name: string;
    role: Role;
    sessionToken: string;
    qrCodeString: string;
    expiryTimestamp: number; // epoch ms, 30-day rolling from login
  };
  message?: string;
}

export interface RegisterResponse {
  success: boolean;
  data?: {
    userId: string;
    name: string;
    role: Role;
  };
  message?: string;
}

export interface MemberActivityResponse {
  success: boolean;
  data?: ActivityProfile;
  message?: string;
}

export interface GrantedUserEventsResponse {
  success: boolean;
  data?: Event[];
  message?: string;
}

export interface CareDashboardResponse {
  success: boolean;
  data?: CareDashboardData;
  message?: string;
}

// =============================================================================
// Session payload (localStorage cache only — server is authoritative)
// =============================================================================

export interface SessionPayload {
  userId: string;
  name: string;
  role: Role;
  sessionToken: string;
  qrCodeString: string;
  expiryTimestamp: number; // epoch ms
}

export interface Result<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}
