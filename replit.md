# FastBills - Patient Billing Management System

## Overview
A workflow management system for tracking patient tasks through insurance verification and billing stages. Focused on accountability, speed of billing turnaround, supervisor oversight, and automatic escalation of delays.

## Architecture
- **Frontend**: React with Tailwind CSS, Shadcn UI, Wouter routing, TanStack Query
- **Backend**: Express.js with session-based auth
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Username/password with express-session

## Key Features
- **Main Board**: Collapsible bucket sections (For Verification, Ready for Billing, Done)
- **Task CRUD**: Create, edit, assign tasks with status/priority color badges
- **Task Detail Drawer**: Right panel with all fields, notes timeline, activity history
- **Supervisor Dashboard**: Stat tiles and charts (by clinic, insurance, employee)
- **Employee Workload**: Leaderboard showing task distribution per employee
- **Billing Queue**: Auto-sorted by priority, IE date, due date
- **Notifications**: In-app notification system
- **Admin Settings**: Manage clinics, insurances, users
- **Reports**: CSV export with filters
- **Audit Trail**: All task changes recorded with user, timestamp, old/new values
- **Overdue Detection**: Visual highlighting, escalation levels (1/3/5 days)

## Task Workflow
1. **For Verification**: Task created and assigned to a verifier. Verifier works on it.
2. **Verifier marks Verified** → Task auto-moves to "Ready for Billing", status becomes "Unassigned", assignment cleared. All admins/assigners get notified to assign a biller.
3. **Admin/Assigner assigns a biller** → Status becomes "Assigned".
4. **Biller marks Billed** → Task auto-moves to "Done" bucket.

Status options are role-restricted:
- Verifier: Assigned, Working on it, Verified, Dropped
- Biller: Assigned, Working on it, Billed
- Admin/Assigner: All statuses

## User Roles
- **Admin**: Full access, override workflow, manage settings, manage users
- **Manager**: Same as Admin, but cannot edit/delete/deactivate existing users
- **Verifier**: Verify insurance, move to Ready for Billing
- **Biller**: Bill verified patients, mark Billed/Done/Dropped
- **Assigner**: Create tasks, assign staff, set priorities

## Default Login
- Admin: `admin` / `admin123`
- Staff accounts: `jsmith`, `mwilson`, `dchen`, `lgarcia`, `tking` / `pass123`

## Project Structure
```
client/src/
  App.tsx              - Main app with auth and routing
  lib/auth.tsx         - Auth context and hooks
  components/
    app-sidebar.tsx    - Navigation sidebar
    status-badge.tsx   - Status/priority/bucket badges
    task-detail-drawer.tsx - Task edit drawer
    create-task-dialog.tsx - New task dialog
  pages/
    login.tsx          - Login page
    board.tsx          - Main task board
    dashboard.tsx      - Supervisor dashboard
    workload.tsx       - Employee workload view
    billing-queue.tsx  - Auto-sorted billing queue
    notifications.tsx  - Notifications page
    settings.tsx       - Admin settings
    reports.tsx        - Export/reports page

server/
  index.ts             - Express server setup
  db.ts                - Database connection
  routes.ts            - API endpoints
  storage.ts           - Data access layer
  seed.ts              - Seed data

shared/
  schema.ts            - Drizzle schema and types
```

## Database Tables
- users, tasks, task_activity, clinics, insurances, notifications
- Enums: role, bucket, status, priority
