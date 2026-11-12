/**
 * Staged manager assignment for existing Verification/Billing tasks only.
 * Other tracker schemas use free-text assignees, so they remain read-only
 * until their assignment migrations and workflow side effects are reviewed.
 *
 * PATCH uses optimistic concurrency, transaction, activity history and a
 * separate new notification. It never creates duplicate task records.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "./db";
import { resolveRcmAccess } from "./rcm-access-service";
import { resourceAllowed } from "../shared/rcm-access-policy";
import { taskDepartment, canAssignTaskState } from "../shared/rcm-task-assignment-policy";

const numericId = z.coerce.number().int().positive();
const assignment = z.object({
  assignedUserId: z.number().int().positive().nullable(),
  expectedAssignedUserId: z.number().int().positive().nullable(),
}).strict();

function assertSameOrigin(req: Request): boolean {
  if (!req.is("application/json")) return false;
  const site = req.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.get("origin");
  if (!origin) return true;
  // Origin derives from the browser; compare against the request's host.
  // The JSON-only + same-origin Fetch Metadata requirements prevent cross-site form CSRF.
  try { return new URL(origin).host === req.get("host"); }
  catch { return false; }
}

async function scopedTaskActor(req: Request, taskId: number) {
  if (!req.session.userId || req.session.originalUserId) return null;
  const access = await resolveRcmAccess(req.session.userId);
  if (!access) return null;
  const result = await pool.query(
    "SELECT id, bucket::text AS bucket, status::text AS status, clinic_id AS \"clinicId\" FROM tasks WHERE id=$1",
    [taskId],
  );
  const row = result.rows[0];
  if (!row?.clinicId) return null;
  const department = taskDepartment(row.bucket);
  if (!department || !resourceAllowed(access.context,"tasks.read",{departmentId:department,clinicId:row.clinicId})
    || !resourceAllowed(access.context,"tasks.assign",{departmentId:department,clinicId:row.clinicId})) return null;
  return { department, clinicId: Number(row.clinicId), task: row };
}

export function registerRcmTaskAssignmentRoutes(app: Express) {
  app.get("/api/rcm/taskboard/tasks/:taskId/assignees", async(req:Request,res:Response,next:NextFunction)=>{
    if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
    if(req.session.originalUserId)return res.status(403).json({message:"Impersonation cannot assign tasks"});
    let taskId:number;
    try { taskId=numericId.parse(req.params.taskId); }catch{return res.status(400).json({message:"Invalid task ID"});}
    try {
      const actor=await scopedTaskActor(req,taskId);
      if(!actor)return res.status(403).json({message:"Not authorized for task assignment"});
      if(!canAssignTaskState(actor.task.bucket,actor.task.status)) return res.status(409).json({message:"Closed or completed tasks cannot be assigned"});
      // Never send usernames, passwords or sensitive account settings here.
      const candidates=await pool.query("SELECT id, full_name AS \"fullName\" FROM users WHERE active=true ORDER BY full_name,id LIMIT 500");
      const allowed:{id:number;fullName:string}[]=[];
      for(const u of candidates.rows) {
        const target=await resolveRcmAccess(u.id);
        if(target && resourceAllowed(target.context,"tasks.read",{departmentId:actor.department,clinicId:actor.clinicId}))
          allowed.push(u);
      }
      res.setHeader("Cache-Control","private, no-store");
      res.json({users:allowed,taskId});
    }catch(error){next(error);}
  });

  app.patch("/api/rcm/taskboard/tasks/:taskId/assignee",async(req:Request,res:Response,next:NextFunction)=>{
    if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
    if(req.session.originalUserId)return res.status(403).json({message:"Impersonation cannot assign tasks"});
    if(!assertSameOrigin(req))return res.status(403).json({message:"Same-origin JSON request required"});
    const parsed=assignment.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({message:"Invalid assignment request"});
    let taskId:number;
    try{taskId=numericId.parse(req.params.taskId);}catch{return res.status(400).json({message:"Invalid task ID"});}
    const {assignedUserId,expectedAssignedUserId}=parsed.data;
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const found=await client.query(
        "SELECT id, bucket::text AS bucket, status::text AS status, clinic_id AS \"clinicId\", assigned_user_id AS \"assignedUserId\" FROM tasks WHERE id=$1 FOR UPDATE",
        [taskId],
      );
      const task=found.rows[0];
      if(!task){await client.query("ROLLBACK");return res.status(404).json({message:"Task not found"});}
      const department=taskDepartment(task.bucket);
      if(!department || !task.clinicId){
        await client.query("ROLLBACK");return res.status(403).json({message:"Task clinic or department is not eligible for assignment"});
      }
      const scope={departmentId:department,clinicId:Number(task.clinicId)};
      const actor=await resolveRcmAccess(req.session.userId);
      if(!actor || !resourceAllowed(actor.context,"tasks.read",scope) || !resourceAllowed(actor.context,"tasks.assign",scope)){
        await client.query("ROLLBACK");return res.status(403).json({message:"Not authorized to assign this task"});
      }
      if(!canAssignTaskState(task.bucket,task.status)){
        await client.query("ROLLBACK");return res.status(409).json({message:"Cannot reassign completed tasks"});
      }
      if(task.assignedUserId !== expectedAssignedUserId){
        await client.query("ROLLBACK");return res.status(409).json({message:"Assignee changed since you opened the board; refresh and retry"});
      }
      if(assignedUserId !== null){
        const target=await resolveRcmAccess(assignedUserId);
        if(!target || !resourceAllowed(target.context,"tasks.read",scope)){
          await client.query("ROLLBACK");return res.status(403).json({message:"Selected employee is inactive or outside this clinic/department"});
        }
      }
      if(assignedUserId === task.assignedUserId){
        await client.query("COMMIT");return res.json({ok:true,unchanged:true});
      }
      const newStatus=assignedUserId === null
        ? (task.status === "assigned" ? "unassigned" : task.status)
        : (task.status === "unassigned" ? "assigned" : task.status);
      await client.query("UPDATE tasks SET assigned_user_id=$2,status=$3 WHERE id=$1", [taskId,assignedUserId,newStatus]);
      await client.query(
        "INSERT INTO task_activity(task_id,user_id,action,field,old_value,new_value) VALUES($1,$2,$3,$4,$5,$6)",
        [taskId,req.session.userId,"RCM Task Board assignment changed","assignedUserId",task.assignedUserId===null?null:String(task.assignedUserId),assignedUserId===null?null:String(assignedUserId)],
      );
      if(newStatus !== task.status){
        await client.query(
          "INSERT INTO task_activity(task_id,user_id,action,field,old_value,new_value) VALUES($1,$2,$3,$4,$5,$6)",
          [taskId,req.session.userId,"RCM Task Board status updated","status",task.status,newStatus],
        );
      }
      if(assignedUserId !== null){
        await client.query(
          "INSERT INTO notifications(user_id,task_id,message,read) VALUES($1,$2,$3,false)",
          [assignedUserId,taskId,"You have a new RCM task assignment."],
        );
      }
      await client.query(
        "INSERT INTO rcm_access_audit(actor_user_id,subject_user_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)",
        [req.session.userId,assignedUserId,"task.assignment",JSON.stringify({source:"tasks",recordId:taskId,oldAssigneeId:task.assignedUserId,newAssigneeId:assignedUserId,department,clinicId:scope.clinicId})],
      );
      await client.query("COMMIT");
      res.setHeader("Cache-Control","private, no-store");
      res.json({ok:true,itemKey:`tasks:${taskId}`,assignedUserId,status:newStatus});
    }catch(error){await client.query("ROLLBACK");next(error);}
    finally{client.release();}
  });
}
