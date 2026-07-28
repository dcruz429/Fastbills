import { readFileSync, writeFileSync } from "fs";

const file = "server/storage.ts";
const src = readFileSync(file, "utf8");
const lines = src.split("\n");

// Find the start of the block to replace: "const DAILY = 40;" line (after getPatientDailySchedule)
// and the end: the closing brace of the if (existingToday.length === 0) block
// We'll locate by line numbers we already know.

// Find line index for "    const DAILY = 40;" (inside getPatientDailySchedule)
const dailyLineIdx = lines.findIndex((l, i) => i > 1279 && l.trim() === "const DAILY = 40;");
if (dailyLineIdx === -1) throw new Error("Could not find DAILY line");
console.log("DAILY line index:", dailyLineIdx, "→", lines[dailyLineIdx]);

// Find the end of the if (existingToday.length === 0) block
// It ends with the lone "    }" that closes that if-block, just before the mid-day comment.
// We look for the mid-day new-patient append comment.
const midDayIdx = lines.findIndex((l, i) => i > dailyLineIdx && l.includes("Mid-day new-patient append"));
if (midDayIdx === -1) throw new Error("Could not find mid-day line");
console.log("Mid-day line index:", midDayIdx, "→", lines[midDayIdx]);

// The block we're replacing: from dailyLineIdx to midDayIdx - 1 (inclusive)
const replacement = `    const DAILY = 40;

    // Helper: return YYYY-MM-DD for the N-th business day after a base date
    function nthBizDay(base: Date, n: number): string {
      const d = new Date(base);
      let count = 0;
      while (count < n) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) count++;
      }
      return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    }

    // ── Determine today's current state ──────────────────────────────────────
    // needsBuild      = today has no entries at all
    // needsRollovers  = today was pre-scheduled but rollover pass not yet done
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

    const needsBuild = todayFull.length === 0;
    const hasRolloverEntries = todayFull.some(
      e => e.originalDate !== null && e.originalDate !== "new"
    );
    const needsRollovers = !needsBuild && !hasRolloverEntries && target > START;

    if (needsBuild || needsRollovers) {
      // Track keys already on today so rollovers skip pre-scheduled patients
      const todayKeys = new Set(todayFull.map(e => \`\${e.department}:\${e.sourceId}\`));
      // Respect the cap — count existing pre-scheduled entries
      let insertedCount = todayFull.length;

      // ── Step A: Rollovers (incomplete patients from past days) ────────────────
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

        // Keep only the most-recent past entry per patient
        const latestByPatient = new Map<string, typeof allPastEntries[0]>();
        for (const row of allPastEntries) {
          const key = \`\${row.department}:\${row.sourceId}\`;
          const existing = latestByPatient.get(key);
          if (!existing || row.scheduledDate > existing.scheduledDate) {
            latestByPatient.set(key, row);
          }
        }

        // Sort oldest-scheduled first so longest-waiting patients roll first
        const rolloverCandidates = [...latestByPatient.values()]
          .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

        for (const entry of rolloverCandidates) {
          if (insertedCount >= DAILY) break; // cap reached
          const key = \`\${entry.department}:\${entry.sourceId}\`;
          if (todayKeys.has(key)) continue; // already on today (pre-scheduled)

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

      // ── Step B: Fresh fill + pre-schedule remaining patients across future days ──
      // Only runs on a completely new build (not a pre-scheduled day getting rollovers).
      if (needsBuild) {
        const remaining = DAILY - insertedCount;
        const allActive = await this._fetchAllActivePatients(userId, userFullName);

        // Patients already assigned to any date for this user
        const allScheduled = await db.select({
          sourceId:   patientCallSchedule.sourceId,
          department: patientCallSchedule.department,
        }).from(patientCallSchedule)
          .where(eq(patientCallSchedule.userId, userId));

        const scheduledKeys = new Set(allScheduled.map(r => \`\${r.department}:\${r.sourceId}\`));
        const fresh = allActive.filter(p => !scheduledKeys.has(\`\${p.department}:\${p.sourceId}\`));

        // Fill today's remaining slots
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

        // ── Step C: Pre-schedule all remaining fresh patients across future days ──
        // Distributes the full workload (40/day) so every patient has a visible
        // scheduled date instead of being hidden until rollovers free up space.
        const toPreSchedule = fresh.slice(toInsertToday.length);
        if (toPreSchedule.length > 0) {
          let bizOffset = 1;
          let idx = 0;
          while (idx < toPreSchedule.length && bizOffset <= 90) {
            const futureDateStr = nthBizDay(target, bizOffset);

            // How many slots remain open on this future date?
            const [{ cnt }] = await db
              .select({ cnt: count() })
              .from(patientCallSchedule)
              .where(and(
                eq(patientCallSchedule.userId, userId),
                eq(patientCallSchedule.scheduledDate, futureDateStr),
              ));
            const freeSlots = Math.max(0, DAILY - Number(cnt));

            if (freeSlots > 0) {
              const chunk = toPreSchedule.slice(idx, idx + freeSlots);
              await db.insert(patientCallSchedule).values(
                chunk.map(p => ({
                  userId,
                  sourceId:   p.sourceId,
                  department: p.department as string,
                  patientName: p.patientName,
                  clinic:      p.clinic ?? null,
                  insurance:   p.insurance ?? null,
                  scheduledDate: futureDateStr,
                  originalDate:  null,
                }))
              ).onConflictDoNothing();
              idx += chunk.length;
            }
            bizOffset++;
          }
        }
      }
    }

`;

// Build the new lines array
const before = lines.slice(0, dailyLineIdx);
const after = lines.slice(midDayIdx);
const newLines = [...before, ...replacement.split("\n"), ...after];

writeFileSync(file, newLines.join("\n"), "utf8");
console.log("Patch applied. Total lines:", newLines.length);
