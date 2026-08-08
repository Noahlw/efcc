/**
 * Mock backend for the EFCC check-in prototype.
 *
 * Simulates: programs, events, members, enrollments, attendances, and the
 * business rules for Self Check-In, Assisted Check-In, and Guest Check-In.
 *
 * In a real implementation this logic runs on the Cloudflare Worker; the
 * prototype only needs deterministic responses for UX exploration.
 */

const MOCK = {
  now: () => new Date(),

  loggedInUserId: "GC-LEAD-001",

  programs: [
    {
      programId: "prg-qingchong",
      name: "青崇",
      department: "青區",
      checkInToken: "efcc-qr-qingchong",
      checkInOpensMinutesBeforeStart: 15,
      checkInClosesMinutesAfterEnd: 0,
    },
  ],

  events: (() => {
    const now = new Date();
    // Make the event start 10 minutes ago and end in 80 minutes so the
    // check-in window is open immediately when the prototype loads.
    return [
      {
        eventId: "evt-2026-001",
        programId: "prg-qingchong",
        name: "青崇崇拜",
        startsAt: new Date(now.getTime() - 10 * 60 * 1000),
        endsAt: new Date(now.getTime() + 80 * 60 * 1000),
        manualCode: "A7B9C2",
        status: "Active",
      },
    ];
  })(),

  members: [
    {
      userId: "GC-MEM-0001",
      name: "張三",
      phone: "9123 4567",
      qrCode: "GC-MEM-0001",
      enrolledProgramIds: ["prg-qingchong"],
      role: "Member",
    },
    {
      userId: "GC-MEM-0002",
      name: "李四",
      phone: "9234 5678",
      qrCode: "GC-MEM-0002",
      enrolledProgramIds: ["prg-qingchong"],
      role: "Member",
    },
    {
      userId: "GC-MEM-0003",
      name: "王五",
      phone: "9345 6789",
      qrCode: "GC-MEM-0003",
      enrolledProgramIds: [],
      role: "Member",
    },
    {
      userId: "GC-LEAD-001",
      name: "陳 leader",
      phone: "9000 0000",
      qrCode: "GC-LEAD-001",
      enrolledProgramIds: ["prg-qingchong"],
      role: "Staff",
      leaderProgramIds: ["prg-qingchong"],
    },
  ],

  attendances: [],

  checkInWindow(event) {
    const program = this.programs.find((p) => p.programId === event.programId);
    const opens = new Date(
      event.startsAt.getTime() -
        program.checkInOpensMinutesBeforeStart * 60 * 1000
    );
    const closes = new Date(
      event.endsAt.getTime() + program.checkInClosesMinutesAfterEnd * 60 * 1000
    );
    return { opensAt: opens, closesAt: closes };
  },

  currentEventForProgram(programId) {
    const now = this.now();
    const candidates = this.events
      .filter((e) => e.programId === programId && e.status === "Active")
      .map((e) => ({ e, window: this.checkInWindow(e) }))
      .filter(({ window }) => now <= window.closesAt)
      .sort((a, b) => b.window.opensAt - a.window.opensAt);
    return candidates.length ? candidates[0].e : null;
  },

  resolveEvent(tokenOrCode) {
    const program = this.programs.find((p) => p.checkInToken === tokenOrCode);
    const codeEvent = this.events.find((e) => e.manualCode === tokenOrCode);
    const event =
      codeEvent ||
      (program ? this.currentEventForProgram(program.programId) : null);
    if (!event) {
      return { ok: false, error: "NO_ONGOING_EVENT" };
    }

    const now = this.now();
    const window = this.checkInWindow(event);
    if (now < window.opensAt || now > window.closesAt) {
      return { ok: false, error: "NO_ONGOING_EVENT" };
    }
    return {
      ok: true,
      event,
      program: this.programs.find((p) => p.programId === event.programId),
    };
  },

  findMemberByQr(qr) {
    return this.members.find((m) => m.qrCode === qr) || null;
  },

  findMemberByQuery(query) {
    const q = query.trim().toLowerCase();
    return this.members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.phone.replaceAll(/\s/gu, "").includes(q.replaceAll(/\s/gu, ""))
    );
  },

  isMemberEnrolled(userId, programId) {
    const m = this.members.find((x) => x.userId === userId);
    return m ? m.enrolledProgramIds.includes(programId) : false;
  },

  isLeaderFor(userId, programId) {
    const m = this.members.find((x) => x.userId === userId);
    return m && m.leaderProgramIds
      ? m.leaderProgramIds.includes(programId)
      : false;
  },

  canAssistCheckIn(actorUserId) {
    const m = this.members.find((x) => x.userId === actorUserId);
    if (!m) {
      return false;
    }
    return (
      m.role === "Admin" ||
      m.role === "Staff" ||
      this.isLeaderFor(actorUserId, "prg-qingchong")
    );
  },

  recordSelfCheckIn({ actorUserId, tokenOrCode }) {
    const resolved = this.resolveEvent(tokenOrCode);
    if (!resolved.ok) {
      return resolved;
    }
    const { event, program } = resolved;
    if (!this.isMemberEnrolled(actorUserId, program.programId)) {
      return { ok: false, error: "NOT_ENROLLED" };
    }
    const duplicate = this.attendances.find(
      (a) =>
        a.eventId === event.eventId &&
        a.memberUserId === actorUserId &&
        a.status === "Active"
    );
    if (duplicate) {
      return {
        ok: true,
        duplicate: true,
        attendance: duplicate,
        event,
        program,
      };
    }
    const attendance = this.createAttendance({
      event,
      memberUserId: actorUserId,
      method:
        tokenOrCode === event.manualCode ? "self_manual_code" : "self_qr_scan",
      checkedInBy: actorUserId,
    });
    return { ok: true, attendance, event, program };
  },

  recordAssistedCheckIn({ actorUserId, eventId, targetUserId, method }) {
    if (!this.canAssistCheckIn(actorUserId)) {
      return { ok: false, error: "FORBIDDEN" };
    }
    const event = this.events.find((e) => e.eventId === eventId);
    if (!event) {
      return { ok: false, error: "EVENT_NOT_FOUND" };
    }
    const program = this.programs.find((p) => p.programId === event.programId);
    if (!this.isMemberEnrolled(targetUserId, program.programId)) {
      return { ok: false, error: "NOT_ENROLLED" };
    }
    const duplicate = this.attendances.find(
      (a) =>
        a.eventId === eventId &&
        a.memberUserId === targetUserId &&
        a.status === "Active"
    );
    if (duplicate) {
      return {
        ok: true,
        duplicate: true,
        attendance: duplicate,
        event,
        program,
      };
    }
    const attendance = this.createAttendance({
      event,
      memberUserId: targetUserId,
      method,
      checkedInBy: actorUserId,
    });
    return { ok: true, attendance, event, program };
  },

  recordGuestCheckIn({ tokenOrCode, guestName, guestPhone }) {
    const resolved = this.resolveEvent(tokenOrCode);
    if (!resolved.ok) {
      return resolved;
    }
    const { event, program } = resolved;
    const attendance = this.createAttendance({
      event,
      memberUserId: null,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
      method:
        tokenOrCode === event.manualCode
          ? "guest_manual_code"
          : "guest_qr_scan",
      checkedInBy: null,
    });
    return { ok: true, attendance, event, program };
  },

  createAttendance({
    event,
    memberUserId,
    guestName,
    guestPhone,
    method,
    checkedInBy,
  }) {
    const attendance = {
      attendanceId: `att-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      eventId: event.eventId,
      memberUserId,
      guestName: guestName || null,
      guestPhone: guestPhone || null,
      method,
      checkedInBy,
      status: "Active",
      checkedInAt: this.now(),
    };
    this.attendances.push(attendance);
    return attendance;
  },

  getEventAttendance(eventId) {
    return this.attendances.filter(
      (a) => a.eventId === eventId && a.status === "Active"
    );
  },

  voidAttendance({ attendanceId, actorUserId, reason }) {
    const a = this.attendances.find((x) => x.attendanceId === attendanceId);
    if (!a) {
      return { ok: false, error: "NOT_FOUND" };
    }
    a.status = "Voided";
    a.voidedBy = actorUserId;
    a.voidedAt = this.now();
    a.voidReason = reason;
    return { ok: true, attendance: a };
  },
};

window.MOCK = MOCK;
