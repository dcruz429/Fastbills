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
- **Admin Settings**: Manage clinics, insurances, dropdown options, users
- **Reports**: CSV export with filters
- **Audit Trail**: All task changes recorded with user, timestamp, old/new values
- **Overdue Detection**: Visual highlighting, escalation levels (1/3/5 days)
- **Checks**: Track check payments with Assigned To, Clinic, Check No, Amount, Check Date, Input Date, Insurance, File Name, Scanned Date, Type, Status, Posted Date, Deposit Date, Deposited By fields; restricted to Payment Specialist, Case Manager, and Admin roles
- **Posting**: Track scanned documents through posting workflow with File #, Clinic, Document Type, Priority, Assigned To, Status fields, slide-out drawer editing, activity history
- **Denials**: Track insurance denials with full spreadsheet-style table, dropdown selects for Type of Denial, Filed To, ARB Status, ARB Payment Status
- **Arbitration**: Separate tracker mirroring Denials template for arbitration cases with same columns, CRUD, activity history
- **RTP (Return to Partner)**: Records sent from any tracker via "Send to RTP" outcome; organized by source tracker with source-specific columns (recordData JSON), full CRUD, activity history, notes; old "RTP" outcome replaced with "Send to RTP"
- **Done Sections**: All tracker pages (Posting, Collections, Denials, Arbitration, Checks) have a collapsible "Done" section below the main table, separating active records from completed ones
- **Productivity**: Comprehensive productivity metrics across all trackers (Verification/Billing, Denials, Arbitration, Collections, Posting, Checks, Closed); filterable by tracker, employee, and date range; stacked bar chart by source, employee leaderboard with per-tracker breakdown
- **Suggestion Box**: Ticket system for owner→developer communication with file uploads, comments, status tracking (Open → Working on it → Done → Closed), categories (Bug, Feature Request, UI Change, Question, Other), priority levels
- **Message Board**: Announcements with targeted delivery (all staff, by role, specific users), read receipts/acknowledgment tracking, admin/manager can post and delete
- **Direct Messages**: Real-time 1:1 messaging between users with read receipts, unread counts in sidebar, conversation list with last message preview

## Page Layout
- **My Tasks** (`/my-tasks`): Shows all tasks assigned to the current user across all buckets with bucket badge, filters, sorting, task detail drawer
- **Verification** (`/verification`): Standalone page showing only "For Verification" bucket tasks with filters, sorting, task detail drawer
- **Billing** (`/`): Shows "Ready for Billing" and "Done" buckets (no longer shows For Verification)

## Outcome-Based Workflow
All tracker pages have an **Outcome** dropdown with 10 options:
- Send to Verification, Send to Billing, Send to Posting, Send to Collections, Send to Denials, Send to Arbitration, Send to Closed, Paid, Loss, RTP

When an Outcome is selected:
- **Send to X**: A new record is created in the target tracker with **Unassigned** status, carrying over patient name, clinic, insurance, amount, notes/comments, and activity history.
- **Paid / Loss**: No automation, just marks the outcome.
- **RTP**: Creates a new record in the Closed tracker with source "RTP - [SourceTracker]". RTP records are visually highlighted on the Closed page with an orange pulsing badge, orange left border, and their own collapsible section at the top.

## Unified Status Options
All trackers (Verification, Billing, Collections, Denials, Arbitration, Checks, Posting, Closed) use the same 4 status options:
- **Unassigned**, **Assigned**, **Working on it**, **Done**

## User Roles
- **Admin**: Full access, override workflow, manage settings, manage users
- **Manager**: Same as Admin, but cannot edit/delete/deactivate existing users
- **Verifier**: Verify insurance, move to Ready for Billing
- **Biller**: Bill verified patients, mark Done
- **Case Coordinator** (db value: "assigner"): Create tasks, assign staff, set priorities, access to all tracker pages; NO access to Checks, Productivity, Reports, Settings
- **Payment Specialist** (db value: "payment_specialist"): Full access to all tracker pages including Checks; NO access to Productivity, Reports, Settings
- **Account Manager** (db value: "account_manager"): Same as Manager WITH access to Checks page
- **Case Manager** (db value: "case_manager"): Same as Manager but NO access to Checks page
- **Delete**: Only Admin role can delete records across all trackers (frontend + backend enforced)

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
    my-tasks.tsx       - My Tasks page (user's assigned tasks)
    board.tsx          - Billing page (Ready for Billing + Done)
    verification.tsx   - Verification page (For Verification bucket)
    dashboard.tsx      - Supervisor dashboard
    workload.tsx       - Employee workload view
    billing-queue.tsx  - Auto-sorted billing queue
    notifications.tsx  - Notifications page
    settings.tsx       - Admin settings
    reports.tsx        - Export/reports page
    denials.tsx        - Insurance denials tracker
    arbitration.tsx    - Arbitration tracker
    productivity.tsx   - Productivity metrics page
    tickets.tsx        - Suggestion box / ticket system
    posting.tsx        - Posting tracker page
    checks.tsx         - Checks tracker page
    closed.tsx         - Closed tracker page
    collections.tsx    - Collections tracker page
    message-board.tsx  - Announcements / message board
    messages.tsx       - Direct messaging

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
- users, tasks, task_activity, clinics, insurances, notifications, denials, denial_activity, arbitrations, arbitration_activity, collections, collection_activity, postings, posting_activity, checks, check_activity, closed, closed_activity, tickets, ticket_comments, announcements, announcement_acks, direct_messages, dropdown_options
- Enums: role (admin, verifier, biller, assigner, manager, payment_specialist, account_manager, case_manager), bucket, status, priority, ticket_status, ticket_priority, ticket_category
- Denials columns: denialFileName, dateInput, intake (dropdown: active users), doa, clinic (dropdown: active clinics), patientName, insurance, dateOfLetter, typeOfDenial, effectiveDate, dosFrom, dosTo, numberOfDays (labeled "# of Visits"), amount, comments, filedTo, arbStatus, trialDate, arbPaymentStatus, amountReceived, checkedBy, comment
