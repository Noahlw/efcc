// Client RPC service with mock fallback for local dev.
// In production (Apps Script), uses google.script.run withSuccessHandler/withFailureHandler.
// In development (Vite), `google` is undefined → mock data returns after 300ms.

import type {
  ActivityProfile,
  AttendanceEntry,
  CareDashboardData,
  CancelEventPayload,
  CheckInPayload,
  CreateEventPayload,
  Event,
  GrantedUserEventsResponse,
  LoginResponse,
  Program,
  ProgramWithEnrollment,
  RegisterPayload,
  RegisterResponse,
} from "../types";
import { getSession } from "./session";

const MOCK_DELAY_MS = 300;

const isMockMode = (): boolean =>
  typeof google === "undefined" || !google.script;

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));


export const apiService = {
  loginUser(username: string, pin: string): Promise<LoginResponse> {
    return new Promise((resolve, reject) => {
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() =>
          resolve({
            success: true,
            data: {
              userId: "USER-MOCK-1",
              name: username,
              role: "MEMBER",
              sessionToken: `mock-token-${Date.now()}`,
              qrCodeString: `EFCC|USER-MOCK-1|${Date.now()}`,
              expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
            },
          })
        );
        return;
      }
      google.script.run
        .withSuccessHandler((result: LoginResponse) => resolve(result))
        .withFailureHandler(reject)
        .api_loginUser(username, pin);
    });
  },

  registerUser(payload: RegisterPayload): Promise<RegisterResponse> {
    return new Promise((resolve, reject) => {
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() =>
          resolve({
            success: true,
            data: {
              userId: "USER-MOCK-NEW",
              name: payload.name,
              role: "MEMBER",
            },
          })
        );
        return;
      }
      google.script.run
        .withSuccessHandler((result: RegisterResponse) => resolve(result))
        .withFailureHandler(reject)
        .api_registerUser(payload);
    });
  },

  getProgramsCatalog(): Promise<Program[]> {
    return new Promise((resolve, reject) => {
      const mockCatalog: Program[] = [
        {
          programId: "PROG-001",
          title: "Sunday Worship Service",
          description: "Weekly Sunday worship gathering.",
          dayOfWeek: "SUNDAY",
          startTime: "10:00",
          endTime: "12:00",
          location: "Main Sanctuary",
        },
        {
          programId: "PROG-002",
          title: "Friday Bible Study",
          description: "Weekly Friday small-group Bible study.",
          dayOfWeek: "FRIDAY",
          startTime: "20:00",
          endTime: "21:30",
          location: "Fellowship Hall",
        },
      ];
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => resolve(mockCatalog));
        return;
      }
      const session = getSession();
      if (!session) {
        reject(new Error("Session expired. Please sign in again."));
        return;
      }
      google.script.run
        .withSuccessHandler((result: Program[]) => resolve(result))
        .withFailureHandler(reject)
        .api_getProgramsCatalog(session.userId, session.sessionToken);
    });
  },

  getAvailablePrograms(userId: string): Promise<ProgramWithEnrollment[]> {
    return new Promise((resolve, reject) => {
      const mockList: ProgramWithEnrollment[] = [
        {
          programId: "PROG-001",
          title: "Sunday Worship Service",
          dayOfWeek: "SUNDAY",
          startTime: "10:00",
          endTime: "12:00",
          location: "Main Sanctuary",
          isEnrolled: false,
        },
        {
          programId: "PROG-002",
          title: "Friday Bible Study",
          dayOfWeek: "FRIDAY",
          startTime: "20:00",
          endTime: "21:30",
          location: "Fellowship Hall",
          isEnrolled: true,
        },
      ];
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => {
          // userId kept for parity with server-side filtering; mock returns as-is.
          void userId;
          resolve(mockList);
        });
        return;
      }
      const session = getSession();
      if (!session || session.userId !== userId) {
        reject(new Error("Session expired. Please sign in again."));
        return;
      }
      google.script.run
        .withSuccessHandler((result: ProgramWithEnrollment[]) =>
          resolve(result)
        )
        .withFailureHandler(reject)
        .api_getAvailablePrograms(userId, session.sessionToken);
    });
  },

  enrollUser(
    userId: string,
    programId: string
  ): Promise<{ success: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => {
          void userId;
          void programId;
          resolve({ success: true });
        });
        return;
      }
      const session = getSession();
      if (!session || session.userId !== userId) {
        reject(new Error("Session expired. Please sign in again."));
        return;
      }
      google.script.run
        .withSuccessHandler((result: { success: boolean; message?: string }) =>
          resolve(result)
        )
        .withFailureHandler(reject)
        .api_enrollUser(userId, programId, session.sessionToken);
    });
  },

  cancelEnrollment(
    userId: string,
    programId: string
  ): Promise<{ success: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => {
          void userId;
          void programId;
          resolve({ success: true });
        });
        return;
      }
      const session = getSession();
      if (!session || session.userId !== userId) {
        reject(new Error("Session expired. Please sign in again."));
        return;
      }
      google.script.run
        .withSuccessHandler((result: { success: boolean; message?: string }) =>
          resolve(result)
        )
        .withFailureHandler(reject)
        .api_cancelEnrollment(userId, programId, session.sessionToken);
    });
  },
  createEvent(payload: CreateEventPayload): Promise<Event> {
    return new Promise((resolve, reject) => {
      const mockEvent: Event = {
        eventId: `EVT-MOCK-${Date.now()}`,
        programId: payload.programId,
        eventName: payload.eventName,
        eventDate: payload.eventDate,
        timeSlot: payload.timeSlot,
        eventType: payload.eventType,
        recurrence: payload.recurrence,
        status: "ACTIVE",
        createdBy: payload.createdBy,
        createdAt: new Date().toISOString(),
      };
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => resolve(mockEvent));
        return;
      }
      const session = getSession();
      const prodPayload = { ...payload, __sessionToken: session?.sessionToken ?? "" };
      google.script.run
        .withSuccessHandler(
          (result: { success: boolean; data?: Event; message?: string }) => {
            if (!result.success || !result.data) {
              reject(new Error(result.message || "Failed to create event."));
              return;
            }
            resolve(result.data);
          }
        )
        .withFailureHandler(reject)
        .api_createEvent(prodPayload);
    });
  },
  cancelEvent(
    payload: CancelEventPayload
  ): Promise<{ success: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => {
          void payload;
          resolve({ success: true });
        });
        return;
      }
      const session = getSession();
      const prodPayload = { ...payload, __sessionToken: session?.sessionToken ?? "" };
      google.script.run
        .withSuccessHandler((result: { success: boolean; message?: string }) =>
          resolve(result)
        )
        .withFailureHandler(reject)
        .api_cancelEvent(prodPayload);
    });
  },

  getGrantedUserEvents(
    grantedUserId: string,
    sessionToken: string
  ): Promise<GrantedUserEventsResponse> {
    const { promise, resolve, reject } = Promise.withResolvers<GrantedUserEventsResponse>();
    if (isMockMode()) {
      delay(MOCK_DELAY_MS).then(() =>
        resolve({
          success: true,
          data: [
            {
              eventId: "EVT-MOCK-001",
              programId: "PRG-001",
              programName: "Sunday Service",
              eventName: "Sunday Service - 28/07/2026",
              eventDate: "28/07/2026",
              timeSlot: "10:00",
              eventType: "REGULAR",
              recurrence: "WEEKLY",
              status: "ACTIVE",
              createdBy: grantedUserId,
              createdAt: new Date().toISOString(),
            },
          ],
        })
      );
      return promise;
    }
    google.script.run
      .withSuccessHandler((result: GrantedUserEventsResponse) => resolve(result))
      .withFailureHandler(reject)
      .api_getGrantedUserEvents(grantedUserId, sessionToken);
    return promise;
  },

  checkInMember(payload: CheckInPayload): Promise<{
    success: boolean;
    notEnrolled?: boolean;
    duplicate?: boolean;
    data?: { checkInTime?: string; memberId?: string; memberName?: string };
    message?: string;
  }> {
    return new Promise((resolve, reject) => {
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() =>
          resolve({
            success: true,
            data: {
              checkInTime: new Date().toISOString(),
              memberName: payload.userId,
            },
          })
        );
        return;
      }
      google.script.run
        .withSuccessHandler(
          (result: {
            success: boolean;
            notEnrolled?: boolean;
            duplicate?: boolean;
            data?: { checkInTime?: string; memberId?: string; memberName?: string };
            message?: string;
          }) => resolve(result)
        )
        .withFailureHandler(reject)
        .api_checkInMember(payload);
    });
  },

  getEventAttendance(
    eventId: string,
    viewerId: string,
    sessionToken: string
  ): Promise<AttendanceEntry[]> {
    const { promise, resolve, reject } = Promise.withResolvers<AttendanceEntry[]>();
    if (isMockMode()) {
      const mockEntries: AttendanceEntry[] = [
        {
          attendanceId: "ATT-MOCK-1",
          eventId,
          userId: "USER-MOCK-1",
          userName: "Mock Member",
          checkInTime: new Date().toISOString(),
          checkInMethod: "QR",
          checkInBy: "STAFF-MOCK",
        },
      ];
      delay(MOCK_DELAY_MS).then(() => resolve(mockEntries));
      return promise;
    }
    google.script.run
      .withSuccessHandler(
        (result: { success: boolean; data?: AttendanceEntry[]; message?: string }) => {
          if (!result.success || !result.data) {
            reject(new Error(result.message || "Failed to load attendance."));
            return;
          }
          resolve(result.data);
        }
      )
      .withFailureHandler(reject)
      .api_getEventAttendance(eventId, viewerId, sessionToken);
    return promise;
  },

  getUserActivityProfile(userId: string, sessionToken: string): Promise<ActivityProfile> {
    return new Promise((resolve, reject) => {
      const mockProfile: ActivityProfile = {
        userId,
        name: "Mock Member",
        lastCheckInAt: new Date().toISOString(),
        totalCheckIns: 7,
        enrolledPrograms: [],
        attendance: [],
      };
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => resolve(mockProfile));
        return;
      }
      google.script.run
        .withSuccessHandler((result: ActivityProfile) => resolve(result))
        .withFailureHandler(reject)
        .api_getUserActivityProfile(userId, sessionToken);
    });
  },

  getCareDashboard(thresholdDays: number, sessionToken: string): Promise<CareDashboardData> {
    return new Promise((resolve, reject) => {
      const mockDashboard: CareDashboardData = {
        generatedAt: new Date().toISOString(),
        thresholdDays,
        inactiveMembers: [],
      };
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => resolve(mockDashboard));
        return;
      }
      google.script.run
        .withSuccessHandler((result: CareDashboardData) => resolve(result))
        .withFailureHandler(reject)
        .api_getCareDashboard(thresholdDays, sessionToken);
    });
  },

  getCurrentSession(
    userId: string,
    sessionToken: string
  ): Promise<LoginResponse> {
    return new Promise((resolve, reject) => {
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() =>
          resolve({
            success: true,
            data: {
              userId,
              name: "Mock Member",
              role: "MEMBER",
              sessionToken,
              qrCodeString: `EFCC|${userId}|${Date.now()}`,
              expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
            },
          })
        );
        return;
      }
      google.script.run
        .withSuccessHandler((result: LoginResponse) => resolve(result))
        .withFailureHandler(reject)
        .api_getCurrentSession(userId, sessionToken);
    });
  },

  logoutUser(userId: string, sessionToken: string): Promise<{ success: boolean }> {
    return new Promise((resolve, reject) => {
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => resolve({ success: true }));
        return;
      }
      google.script.run
        .withSuccessHandler((result: { success: boolean }) => resolve(result))
        .withFailureHandler(reject)
        .api_logoutUser(userId, sessionToken);
    });
  },

  staffEnrollMember(
    grantedUserId: string,
    memberId: string,
    programId: string,
    sessionToken: string
  ): Promise<{ success: boolean; message?: string }> {
    return new Promise((resolve, reject) => {
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => resolve({ success: true }));
        return;
      }
      google.script.run
        .withSuccessHandler(
          (result: { success: boolean; message?: string }) => resolve(result)
        )
        .withFailureHandler(reject)
        .api_staffEnrollMember(grantedUserId, memberId, programId, sessionToken);
    });
  },

  searchMembers(
    query: string,
    grantedUserId: string,
    sessionToken: string
  ): Promise<Array<{ userId: string; name: string; phone?: string }>> {
    const { promise, resolve, reject } = Promise.withResolvers<
      Array<{ userId: string; name: string; phone?: string }>
    >();
    if (isMockMode()) {
      const mockMembers = [
        { userId: "GC-MOCK-0001", name: "Alice Chen", phone: "0912-345-678" },
        { userId: "GC-MOCK-0002", name: "Bob Wang", phone: "0987-654-321" },
        { userId: "GC-MOCK-0003", name: "Carol Liu", phone: "0955-123-456" },
      ];
      const q = query.toLowerCase().trim();
      delay(MOCK_DELAY_MS).then(() =>
        resolve(
          q
            ? mockMembers.filter(
                (m) =>
                  m.name.toLowerCase().includes(q) ||
                  m.userId.toLowerCase().includes(q) ||
                  m.phone.includes(q)
              )
            : []
        )
      );
      return promise;
    }
    google.script.run
      .withSuccessHandler(
        (result: {
          success: boolean;
          data?: Array<{ userId: string; name: string; phone?: string }>;
          message?: string;
        }) => {
          if (!result.success || !result.data) {
            reject(new Error(result.message || "Search failed."));
            return;
          }
          resolve(result.data);
        }
      )
      .withFailureHandler(reject)
      .api_searchMembers(query, grantedUserId, sessionToken);
    return promise;
  },
};
