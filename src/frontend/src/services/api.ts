// Client RPC service with mock fallback for local dev.
// In production (Apps Script), uses google.script.run withSuccessHandler/withFailureHandler.
// In development (Vite), `google` is undefined → mock data returns after 300ms.

import type {
  ActivityProfile,
  AttendanceEntry,
  CancelEventPayload,
  CareDashboardData,
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

const delay = (ms: number): Promise<void> => {
  const { promise, resolve } = createDeferred<void>();
  setTimeout(() => resolve(), ms);
  return promise;
};

export const apiService = {
  async cancelEnrollment(
    userId: string,
    programId: string
  ): Promise<{ success: boolean; message?: string }> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      void userId;
      void programId;
      return { success: true };
    }
    const session = getSession();
    if (!session || session.userId !== userId) {
      throw new Error("Session expired. Please sign in again.");
    }
    const { promise, resolve, reject } = createDeferred<{
      success: boolean;
      message?: string;
    }>();
    google.script.run
      .withSuccessHandler((result: { success: boolean; message?: string }) =>
        resolve(result)
      )
      .withFailureHandler(reject)
      .api_cancelEnrollment(userId, programId, session.sessionToken);
    return promise;
  },

  async cancelEvent(
    payload: CancelEventPayload
  ): Promise<{ success: boolean; message?: string }> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      void payload;
      return { success: true };
    }
    const session = getSession();
    const prodPayload = {
      ...payload,
      __sessionToken: session?.sessionToken ?? "",
    };
    const { promise, resolve, reject } = createDeferred<{
      success: boolean;
      message?: string;
    }>();
    google.script.run
      .withSuccessHandler((result: { success: boolean; message?: string }) =>
        resolve(result)
      )
      .withFailureHandler(reject)
      .api_cancelEvent(prodPayload);
    return promise;
  },

  async checkInMember(payload: CheckInPayload): Promise<{
    success: boolean;
    notEnrolled?: boolean;
    duplicate?: boolean;
    data?: { checkInTime?: string; memberId?: string; memberName?: string };
    message?: string;
  }> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return {
        data: {
          checkInTime: new Date().toISOString(),
          memberName: payload.userId,
        },
        success: true,
      };
    }
    const { promise, resolve, reject } = createDeferred<{
      success: boolean;
      notEnrolled?: boolean;
      duplicate?: boolean;
      data?: {
        checkInTime?: string;
        memberId?: string;
        memberName?: string;
      };
      message?: string;
    }>();
    google.script.run
      .withSuccessHandler(
        (result: {
          success: boolean;
          notEnrolled?: boolean;
          duplicate?: boolean;
          data?: {
            checkInTime?: string;
            memberId?: string;
            memberName?: string;
          };
          message?: string;
        }) => resolve(result)
      )
      .withFailureHandler(reject)
      .api_checkInMember(payload);
    return promise;
  },

  async createEvent(payload: CreateEventPayload): Promise<Event> {
    const mockEvent: Event = {
      createdAt: new Date().toISOString(),
      createdBy: payload.createdBy,
      eventDate: payload.eventDate,
      eventId: `EVT-MOCK-${Date.now()}`,
      eventName: payload.eventName,
      eventType: payload.eventType,
      programId: payload.programId,
      recurrence: payload.recurrence,
      status: "ACTIVE",
      timeSlot: payload.timeSlot,
    };
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return mockEvent;
    }
    const session = getSession();
    const prodPayload = {
      ...payload,
      __sessionToken: session?.sessionToken ?? "",
    };
    const { promise, resolve, reject } = createDeferred<Event>();
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
    return promise;
  },

  async enrollUser(
    userId: string,
    programId: string
  ): Promise<{ success: boolean; message?: string }> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      void userId;
      void programId;
      return { success: true };
    }
    const session = getSession();
    if (!session || session.userId !== userId) {
      throw new Error("Session expired. Please sign in again.");
    }
    const { promise, resolve, reject } = createDeferred<{
      success: boolean;
      message?: string;
    }>();
    google.script.run
      .withSuccessHandler((result: { success: boolean; message?: string }) =>
        resolve(result)
      )
      .withFailureHandler(reject)
      .api_enrollUser(userId, programId, session.sessionToken);
    return promise;
  },

  async getAvailablePrograms(userId: string): Promise<ProgramWithEnrollment[]> {
    const mockList: ProgramWithEnrollment[] = [
      {
        dayOfWeek: "SUNDAY",
        endTime: "12:00",
        isEnrolled: false,
        location: "Main Sanctuary",
        programId: "PROG-001",
        startTime: "10:00",
        title: "Sunday Worship Service",
      },
      {
        dayOfWeek: "FRIDAY",
        endTime: "21:30",
        isEnrolled: true,
        location: "Fellowship Hall",
        programId: "PROG-002",
        startTime: "20:00",
        title: "Friday Bible Study",
      },
    ];
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      void userId;
      return mockList;
    }
    const session = getSession();
    if (!session || session.userId !== userId) {
      throw new Error("Session expired. Please sign in again.");
    }
    const { promise, resolve, reject } =
      createDeferred<ProgramWithEnrollment[]>();
    google.script.run
      .withSuccessHandler((result: ProgramWithEnrollment[]) => resolve(result))
      .withFailureHandler(reject)
      .api_getAvailablePrograms(userId, session.sessionToken);
    return promise;
  },

  async getCareDashboard(
    thresholdDays: number,
    sessionToken: string
  ): Promise<CareDashboardData> {
    const mockDashboard: CareDashboardData = {
      generatedAt: new Date().toISOString(),
      inactiveMembers: [],
      thresholdDays,
    };
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return mockDashboard;
    }
    const { promise, resolve, reject } = createDeferred<CareDashboardData>();
    google.script.run
      .withSuccessHandler((result: CareDashboardData) => resolve(result))
      .withFailureHandler(reject)
      .api_getCareDashboard(thresholdDays, sessionToken);
    return promise;
  },

  async getCurrentSession(
    userId: string,
    sessionToken: string
  ): Promise<LoginResponse> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return {
        data: {
          expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
          name: "Mock Member",
          qrCodeString: `EFCC|${userId}|${Date.now()}`,
          role: "MEMBER",
          sessionToken,
          userId,
        },
        success: true,
      };
    }
    const { promise, resolve, reject } = createDeferred<LoginResponse>();
    google.script.run
      .withSuccessHandler((result: LoginResponse) => resolve(result))
      .withFailureHandler(reject)
      .api_getCurrentSession(userId, sessionToken);
    return promise;
  },

  async getEventAttendance(
    eventId: string,
    viewerId: string,
    sessionToken: string
  ): Promise<AttendanceEntry[]> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return [
        {
          attendanceId: "ATT-MOCK-1",
          checkInBy: "STAFF-MOCK",
          checkInMethod: "QR",
          checkInTime: new Date().toISOString(),
          eventId,
          userId: "USER-MOCK-1",
          userName: "Mock Member",
        },
      ];
    }
    const { promise, resolve, reject } = createDeferred<AttendanceEntry[]>();
    google.script.run
      .withSuccessHandler(
        (result: {
          success: boolean;
          data?: AttendanceEntry[];
          message?: string;
        }) => {
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

  async getGrantedUserEvents(
    grantedUserId: string,
    sessionToken: string
  ): Promise<GrantedUserEventsResponse> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return {
        data: [
          {
            createdAt: new Date().toISOString(),
            createdBy: grantedUserId,
            eventDate: "28/07/2026",
            eventId: "EVT-MOCK-001",
            eventName: "Sunday Service - 28/07/2026",
            eventType: "REGULAR",
            programId: "PRG-001",
            programName: "Sunday Service",
            recurrence: "WEEKLY",
            status: "ACTIVE",
            timeSlot: "10:00",
          },
        ],
        success: true,
      };
    }
    const { promise, resolve, reject } =
      createDeferred<GrantedUserEventsResponse>();
    google.script.run
      .withSuccessHandler((result: GrantedUserEventsResponse) =>
        resolve(result)
      )
      .withFailureHandler(reject)
      .api_getGrantedUserEvents(grantedUserId, sessionToken);
    return promise;
  },

  async getProgramsCatalog(): Promise<Program[]> {
    const mockCatalog: Program[] = [
      {
        dayOfWeek: "SUNDAY",
        description: "Weekly Sunday worship gathering.",
        endTime: "12:00",
        location: "Main Sanctuary",
        programId: "PROG-001",
        startTime: "10:00",
        title: "Sunday Worship Service",
      },
      {
        dayOfWeek: "FRIDAY",
        description: "Weekly Friday small-group Bible study.",
        endTime: "21:30",
        location: "Fellowship Hall",
        programId: "PROG-002",
        startTime: "20:00",
        title: "Friday Bible Study",
      },
    ];
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return mockCatalog;
    }
    const session = getSession();
    if (!session) {
      throw new Error("Session expired. Please sign in again.");
    }
    const { promise, resolve, reject } = createDeferred<Program[]>();
    google.script.run
      .withSuccessHandler((result: Program[]) => resolve(result))
      .withFailureHandler(reject)
      .api_getProgramsCatalog(session.userId, session.sessionToken);
    return promise;
  },

  async getUserActivityProfile(
    userId: string,
    sessionToken: string
  ): Promise<ActivityProfile> {
    const mockProfile: ActivityProfile = {
      attendance: [],
      enrolledPrograms: [],
      lastCheckInAt: new Date().toISOString(),
      name: "Mock Member",
      totalCheckIns: 7,
      userId,
    };
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return mockProfile;
    }
    const { promise, resolve, reject } = createDeferred<ActivityProfile>();
    google.script.run
      .withSuccessHandler((result: ActivityProfile) => resolve(result))
      .withFailureHandler(reject)
      .api_getUserActivityProfile(userId, sessionToken);
    return promise;
  },

  async loginUser(username: string, pin: string): Promise<LoginResponse> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return {
        data: {
          expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000,
          name: username,
          qrCodeString: `EFCC|USER-MOCK-1|${Date.now()}`,
          role: "MEMBER",
          sessionToken: `mock-token-${Date.now()}`,
          userId: "USER-MOCK-1",
        },
        success: true,
      };
    }
    const { promise, resolve, reject } = createDeferred<LoginResponse>();
    google.script.run
      .withSuccessHandler((result: LoginResponse) => resolve(result))
      .withFailureHandler(reject)
      .api_loginUser(username, pin);
    return promise;
  },

  async logoutUser(
    userId: string,
    sessionToken: string
  ): Promise<{ success: boolean }> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return { success: true };
    }
    const { promise, resolve, reject } = createDeferred<{
      success: boolean;
    }>();
    google.script.run
      .withSuccessHandler((result: { success: boolean }) => resolve(result))
      .withFailureHandler(reject)
      .api_logoutUser(userId, sessionToken);
    return promise;
  },

  async registerUser(payload: RegisterPayload): Promise<RegisterResponse> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return {
        data: {
          name: payload.name,
          role: "MEMBER",
          userId: "USER-MOCK-NEW",
        },
        success: true,
      };
    }
    const { promise, resolve, reject } = createDeferred<RegisterResponse>();
    google.script.run
      .withSuccessHandler((result: RegisterResponse) => resolve(result))
      .withFailureHandler(reject)
      .api_registerUser(payload);
    return promise;
  },

  async searchMembers(
    query: string,
    grantedUserId: string,
    sessionToken: string
  ): Promise<{ userId: string; name: string; phone?: string }[]> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      const mockMembers = [
        { name: "Alice Chen", phone: "0912-345-678", userId: "GC-MOCK-0001" },
        { name: "Bob Wang", phone: "0987-654-321", userId: "GC-MOCK-0002" },
        { name: "Carol Liu", phone: "0955-123-456", userId: "GC-MOCK-0003" },
      ];
      const q = query.toLowerCase().trim();
      return q
        ? mockMembers.filter(
            (m) =>
              m.name.toLowerCase().includes(q) ||
              m.userId.toLowerCase().includes(q) ||
              m.phone.includes(q)
          )
        : [];
    }
    const { promise, resolve, reject } =
      createDeferred<{ userId: string; name: string; phone?: string }[]>();
    google.script.run
      .withSuccessHandler(
        (result: {
          success: boolean;
          data?: { userId: string; name: string; phone?: string }[];
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

  async staffEnrollMember(
    grantedUserId: string,
    memberId: string,
    programId: string,
    sessionToken: string
  ): Promise<{ success: boolean; message?: string }> {
    if (isMockMode()) {
      await delay(MOCK_DELAY_MS);
      return { success: true };
    }
    const { promise, resolve, reject } = createDeferred<{
      success: boolean;
      message?: string;
    }>();
    google.script.run
      .withSuccessHandler((result: { success: boolean; message?: string }) =>
        resolve(result)
      )
      .withFailureHandler(reject)
      .api_staffEnrollMember(grantedUserId, memberId, programId, sessionToken);
    return promise;
  },
};
