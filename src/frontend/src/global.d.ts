declare namespace google {
  namespace script {
    interface RunClient {
      withSuccessHandler<T>(handler: (result: T) => void): RunClient;
      withFailureHandler(handler: (error: Error) => void): RunClient;
      api_loginUser(username: string, pin: string): void;
      api_registerUser(payload: unknown): void;
      api_getProgramsCatalog(userId: string, sessionToken: string): void;
      api_getAvailablePrograms(userId: string, sessionToken: string): void;
      api_enrollUser(userId: string, programId: string, sessionToken: string): void;
      api_cancelEnrollment(userId: string, programId: string, sessionToken: string): void;
      api_createEvent(payload: unknown): void;
      api_cancelEvent(payload: unknown): void;
      api_checkInMember(payload: unknown): void;
      api_getEventAttendance(eventId: string, viewerId: string, sessionToken: string): void;
      api_getUserActivityProfile(userId: string, sessionToken: string): void;
      api_getCareDashboard(thresholdDays: number, sessionToken: string): void;
      api_logoutUser(userId: string, sessionToken: string): void;
      api_getCurrentSession(userId: string, sessionToken: string): void;
      api_getGrantedUserEvents(grantedUserId: string, sessionToken: string): void;
      api_staffEnrollMember(grantedUserId: string, memberId: string, programId: string, sessionToken: string): void;
      api_searchMembers(query: string, grantedUserId: string, sessionToken: string): void;
    }
    const run: RunClient;
  }
}
