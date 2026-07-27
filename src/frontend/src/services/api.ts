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
  LoginResponse,
  Program,
  ProgramWithEnrollment,
  RegisterPayload,
  RegisterResponse,
} from "../types";

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
      google.script.run
        .withSuccessHandler((result: Program[]) => resolve(result))
        .withFailureHandler(reject)
        .api_getProgramsCatalog();
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
      google.script.run
        .withSuccessHandler((result: ProgramWithEnrollment[]) =>
          resolve(result)
        )
        .withFailureHandler(reject)
        .api_getAvailablePrograms(userId);
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
      google.script.run
        .withSuccessHandler((result: { success: boolean; message?: string }) =>
          resolve(result)
        )
        .withFailureHandler(reject)
        .api_enrollUser(userId, programId);
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
      google.script.run
        .withSuccessHandler((result: { success: boolean; message?: string }) =>
          resolve(result)
        )
        .withFailureHandler(reject)
        .api_cancelEnrollment(userId, programId);
    });
  },

  createEvent(payload: CreateEventPayload): Promise<Event> {
    return new Promise((resolve, reject) => {
      const mockEvent: Event = {
        eventId: `EVT-MOCK-${Date.now()}`,
        programId: payload.programId,
        title: payload.title,
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        location: payload.location,
        status: "ACTIVE",
        createdBy: payload.createdBy,
        createdAt: new Date().toISOString(),
      };
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => resolve(mockEvent));
        return;
      }
      google.script.run
        .withSuccessHandler((result: Event) => resolve(result))
        .withFailureHandler(reject)
        .api_createEvent(payload);
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
      google.script.run
        .withSuccessHandler((result: { success: boolean; message?: string }) =>
          resolve(result)
        )
        .withFailureHandler(reject)
        .api_cancelEvent(payload);
    });
  },

  checkInMember(payload: CheckInPayload): Promise<{
    success: boolean;
    data?: { checkInTime: string };
    duplicate?: boolean;
    message?: string;
  }> {
    return new Promise((resolve, reject) => {
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() =>
          resolve({
            success: true,
            data: { checkInTime: new Date().toISOString() },
          })
        );
        return;
      }
      google.script.run
        .withSuccessHandler(
          (result: {
            success: boolean;
            data?: { checkInTime: string };
            duplicate?: boolean;
            message?: string;
          }) => resolve(result)
        )
        .withFailureHandler(reject)
        .api_checkInMember(payload);
    });
  },

  getEventAttendance(eventId: string): Promise<AttendanceEntry[]> {
    return new Promise((resolve, reject) => {
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
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => resolve(mockEntries));
        return;
      }
      google.script.run
        .withSuccessHandler((result: AttendanceEntry[]) => resolve(result))
        .withFailureHandler(reject)
        .api_getEventAttendance(eventId);
    });
  },

  getUserActivityProfile(userId: string): Promise<ActivityProfile> {
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
        .api_getUserActivityProfile(userId);
    });
  },

  getCareDashboard(thresholdDays: number): Promise<CareDashboardData> {
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
        .api_getCareDashboard(thresholdDays);
    });
  },

  logoutUser(): Promise<{ success: boolean }> {
    return new Promise((resolve, reject) => {
      if (isMockMode()) {
        delay(MOCK_DELAY_MS).then(() => resolve({ success: true }));
        return;
      }
      google.script.run
        .withSuccessHandler((result: { success: boolean }) => resolve(result))
        .withFailureHandler(reject)
        .api_logoutUser();
    });
  },
};
