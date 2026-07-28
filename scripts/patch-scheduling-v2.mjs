import { readFileSync, writeFileSync } from "fs";

const file = "server/storage.ts";
const src = readFileSync(file, "utf8");
const lines = src.split("\n");

// Find "const DAILY = 40;" line inside getPatientDailySchedule
const dailyLineIdx = lines.findIndex((l, i) => i > 1279 && l.trim() === "const DAILY = 40;");
if (dailyLineIdx === -1) throw new Error("Could not find DAILY line");
console.log("DAILY at index:", dailyLineIdx);

// Find the closing "    }" of the big if (needsBuild || needsRollovers) block
// It's the blank line followed by the mid-day comment
const midDayIdx = lines.findIndex((l, i) => i > dailyLineIdx && l.includes("Mid-day new-patient append"));
if (midDayIdx === -1) throw new Error("Could not find mid-day line");
console.log("Mid-day at index:", midDayIdx);

const replacement = `    const DAILY = 40;

    // Helper: return YYYY-MM-DD for the N-th business day after a base date
    function nthBizDay(base: Date, n: number): string {
      const d = new Date(base);
      let bizDays = 0;
      while (bizDays < n) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) bizDays++;
      }
      return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    }

    // ── FIRST-EVER BUILD: check if this user has ANY schedule entries at all ──
    // If not, distribute all active patients across business days (40/day) in one
    // shot so the entire workload is visible immediately.  Using onConflictDoNothing
    // means even if two parallel requests both see "no entries" and race, they compute
    // the identical deterministic distribution and the second insert is silently ignored.
    const anyExisting = await db
      .select({ id: patientCallSchedule.id })
      .from(patientCallSchedule)
      .where(eq(patientCallSchedule.userId, userId))
      .limit(1);

    if (anyExisting.length === 0) {
      const allActive = await this._fetchAllActivePatients(userId, userFullName);
      let dayOffset = 0;
      let idx = 0;
      while (idx < allActive.length && dayOffset <= 90) {
        const slotDateStr = dayOffset === 0
          ? dateStr
          : nthBizDay(target, dayOffset);
        const chunk = allActive.slice(idx, idx + DAILY);
        await db.insert(patientCallSchedule).values(
          chunk.map(p => ({
            userId,
            sourceId:   p.sourceId,
            department: p.department as string,
            patientName: p.patientName,
            clinic:      p.clinic ?? null,
            insurance:   p.insurance ?? null,
            scheduledDate: slotDateStr,
            originalDate:  null,
          }))
        ).onConflictDoNothing();
        idx += DAILY;
        dayOffset++;
      }
    }

    // ── PER-DAY BUILD: rollovers + fresh fill (runs once per date) ──────────
    // Today's current state (may already be populated from the spread above)
    const todayFull = await db.select({
      id: patientCallSchedule.id,
      sourceId: patientCallSchedule.sourceId,
      department: patientCallSchedule.department,
      originalDate: patientCallSchedule.originalDate,
    }).from(patientCallSchedule)
      .where(and(
        eq(patientCallSchedule.userId, userId),
        eq(patientCallSchedule.scheduledDate, dateStr),
      ));

    // needsBuild     = today has no entries at all
    // needsRollovers = today has pre-scheduled entries but rollover pass not yet done
    const needsBuild = todayFull.length === 0;
    const hasRolloverEntries = todayFull.some(
      e => e.originalDate !== null && e.originalDate !== "new"
    );
    const needsRollovers = !needsBuild && !hasRolloverEntries && target > START;

    if (needsBuild || needsRollovers) {
      const todayKeys = new Set(todayFull.map(e => \`\${e.department}:\${e.sourceId}\`));
      // Count pre-scheduled entries toward the daily cap
      let insertedCount = todayFull.length;

      // ── Step A: Rollovers (incomplete patients from past days) ──────────────
      if (target > START) {
        const allPastEntries = await db.select({
          sourceId:    patientCallSchedule.sourceId,
          department:  patientCallSchedule.department,
          patientName: patientCallSchedule.patientName,
          clinic:      patientCallSchedule.clinic,
          insurance:   patientCallSchedule.insurance,
          scheduledDate: patientCallSchedule.scheduledDate,
        }).from(patientCallSchedule)
          .where(and(
            eq(patientCallSchedule.userId, userId),
            sql\`\${patientCallSchedule.scheduledDate} < \${dateStr}\`,
          ));

        const latestByPatient = new Map<string, typeof allPastEntries[0]>();
        for (const row of allPastEntries) {
          const key = \`\${row.department}:\${row.sourceId}\`;
          const existing = latestByPatient.get(key);
          if (!existing || row.scheduledDate > existing.scheduledDate) {
            latestByPatient.set(key, row);
          }
        }

        const rolloverCandidates = [...latestByPatient.values()]
          .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

        for (const entry of rolloverCandidates) {
          if (insertedCount >= DAILY) break;
          const key = \`\${entry.department}:\${entry.sourceId}\`;
          if (todayKeys.has(key)) continue; // already here (pre-scheduled)

          const isActive = await this._isPatientStillActive(
            entry.sourceId, entry.department!, userId, userFullName
          );
          if (!isActive) continue;

          await db.insert(patientCallSchedule).values({
            userId,
            sourceId:    entry.sourceId,
            department:  entry.department!,
            patientName: entry.patientName,
            clinic:      entry.clinic,
            insurance:   entry.insurance,
            scheduledDate: dateStr,
            originalDate:  entry.scheduledDate,
          }).onConflictDoNothing();

          await db.insert(patientCallAudit).values({
            userId,
            sourceId:    entry.sourceId,
            department:  entry.department!,
            patientName: entry.patientName,
            action:    "auto_rollover",
            fromDate:  entry.scheduledDate,
            toDate:    dateStr,
          });
          todayKeys.add(key);
          insertedCount++;
        }
      }

      // ── Step B: Fill today's slots with fresh patients ───────────────────────
      // Handles patients assigned after the initial spread was built, and the case
      // where today was never reached by the spread (e.g. user had 0 patients before).
      if (needsBuild) {
        const remaining = DAILY - insertedCount;
        if (remaining > 0) {
          const allActive = await this._fetchAllActivePatients(userId, userFullName);

          const allScheduled = await db.select({
            sourceId:   patientCallSchedule.sourceId,
            department: patientCallSchedule.department,
          }).from(patientCallSchedule)
            .where(eq(patientCallSchedule.userId, userId));

          const scheduledKeys = new Set(allScheduled.map(r => \`\${r.department}:\${r.sourceId}\`));
          const fresh = allActive.filter(p => !scheduledKeys.has(\`\${p.department}:\${p.sourceId}\`));
          const toInsertToday = fresh.slice(0, remaining);

          if (toInsertToday.length > 0) {
            await db.insert(patientCallSchedule).values(
              toInsertToday.map(p => ({
                userId,
                sourceId:   p.sourceId,
                department: p.department as string,
                patientName: p.patientName,
                clinic:      p.clinic ?? null,
                insurance:   p.insurance ?? null,
                scheduledDate: dateStr,
                originalDate:  null,
              }))
            ).onConflictDoNothing();
          }
        }
      }
    }

`;

const before = lines.slice(0, dailyLineIdx);
const after = lines.slice(midDayIdx);
const newLines = [...before, ...replacement.split("\n"), ...after];

writeFileSync(file, newLines.join("\n"), "utf8");
console.log("Patch v2 applied. Total lines:", newLines.length);
