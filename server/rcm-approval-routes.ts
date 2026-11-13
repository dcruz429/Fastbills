/**
 * Two-person review for high/critical assignment changes.
 * Approval changes ONLY the approval ledger, not the existing task itself.
 * Assignment endpoint consumes a matching approved approval transactionally.
 */
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { pool } from "./db";
import { resolveRcmAccess } from "./rcm-access-service";
import { resourceAllowed } from "../shared/rcm-access-policy";
import { taskDepartment, canAssignTaskState } from "../shared/rcm-task-assignment-policy";
import { requiresAssignmentApproval, canReviewRiskApproval } from "../shared/rcm-risk-approval-policy";

const positiveId=z.coerce.number().int().positive();
const requestSchema=z.object({
  requestedAssigneeId:z.number().int().positive().nullable(),
  expectedAssigneeId:z.number().int().positive().nullable(),
}).strict();
const decisionSchema=z.object({decision:z.enum(["approved","rejected"]),note:z.string().max(1000).optional()}).strict();

function isSameOriginJson(req:Request):boolean {
  if(!req.is("application/json"))return false;
  const site=req.get("sec-fetch-site");
  if(site&&site!=="same-origin"&&site!=="none")return false;
  const origin=req.get("origin");
  if(!origin)return true;
  try{return new URL(origin).host===req.get("host");}catch{return false;}
}

export function registerRcmApprovalRoutes(app:Express){
  app.post("/api/rcm/taskboard/tasks/:taskId/approval-request", async(req:Request,res:Response,next:NextFunction)=>{
    if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
    if(req.session.originalUserId||!isSameOriginJson(req))return res.status(403).json({message:"Not permitted"});
    const parsed=requestSchema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({message:"Invalid approval request"});
    let taskId:number;
    try{taskId=positiveId.parse(req.params.taskId);}catch{return res.status(400).json({message:"Invalid task ID"});}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const result=await client.query(
        "SELECT id,bucket::text AS bucket,status::text AS status,priority::text AS priority,clinic_id AS \"clinicId\",assigned_user_id AS \"assignedUserId\" FROM tasks WHERE id=$1 FOR UPDATE",
        [taskId],
      );
      const task=result.rows[0];
      if(!task){await client.query("ROLLBACK");return res.status(404).json({message:"Task not found"});}
      const department=taskDepartment(task.bucket);
      if(!department||!task.clinicId||!canAssignTaskState(task.bucket,task.status)||!requiresAssignmentApproval(task.priority)){
        await client.query("ROLLBACK");return res.status(409).json({message:"Task is not eligible for risk approval"});
      }
      const scope={departmentId:department,clinicId:Number(task.clinicId)};
      const actor=await resolveRcmAccess(req.session.userId);
      if(!actor||!resourceAllowed(actor.context,"tasks.assign",scope)||!resourceAllowed(actor.context,"tasks.read",scope)){
        await client.query("ROLLBACK");return res.status(403).json({message:"Not authorized"});
      }
      if(task.assignedUserId!==parsed.data.expectedAssigneeId||task.assignedUserId===parsed.data.requestedAssigneeId){
        await client.query("ROLLBACK");return res.status(409).json({message:"Task assignment changed or no change requested"});
      }
      const targetId=parsed.data.requestedAssigneeId;
      if(targetId!==null){
        const employee=await resolveRcmAccess(targetId);
        if(!employee||!resourceAllowed(employee.context,"tasks.read",scope)){
          await client.query("ROLLBACK");return res.status(403).json({message:"Selected employee is outside the allowed scope"});
        }
      }
      const alreadyPending=await client.query("SELECT id FROM rcm_task_approvals WHERE task_id=$1 AND status='pending'",[taskId]);
      if(alreadyPending.rowCount){
        await client.query("ROLLBACK");return res.status(409).json({message:"A review request is already pending for this task"});
      }
      const created=await client.query(
        "INSERT INTO rcm_task_approvals(task_id,requested_by,requested_assignee_id,expected_assignee_id,risk_level) VALUES($1,$2,$3,$4,$5) RETURNING id,status",
        [taskId,req.session.userId,targetId,task.assignedUserId,task.priority],
      );
      await client.query(
        "INSERT INTO rcm_access_audit(actor_user_id,event_type,payload) VALUES($1,$2,$3::jsonb)",
        [req.session.userId,"approval.requested",JSON.stringify({taskId,approvalId:created.rows[0].id,priority:task.priority})],
      );
      await client.query("COMMIT");
      res.status(201).json({id:created.rows[0].id,status:"pending"});
    }catch(error){await client.query("ROLLBACK");next(error);}
    finally{client.release();}
  });

  app.get("/api/rcm/taskboard/approvals", async(req:Request,res:Response,next:NextFunction)=>{
    if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
    if(req.session.originalUserId)return res.status(403).json({message:"Review unavailable during impersonation"});
    try{
      const actor=await resolveRcmAccess(req.session.userId);
      if(!actor)return res.status(403).json({message:"Not authorized"});
      const rows=await pool.query(
        "SELECT a.id,a.task_id AS \"taskId\",a.requested_by AS \"requestedBy\",a.requested_assignee_id AS \"requestedAssigneeId\",a.expected_assignee_id AS \"expectedAssigneeId\",a.risk_level AS \"riskLevel\",a.status,a.requested_at AS \"requestedAt\",t.bucket::text AS bucket,t.clinic_id AS \"clinicId\",c.name AS \"clinicName\" FROM rcm_task_approvals a JOIN tasks t ON t.id=a.task_id LEFT JOIN clinics c ON c.id=t.clinic_id WHERE a.status='pending' ORDER BY a.requested_at ASC LIMIT 500",
      );
      const reviewable=rows.rows.filter(row=>{
        const department=taskDepartment(row.bucket);
        return department&&row.clinicId&&row.requestedBy!==req.session.userId &&
          resourceAllowed(actor.context,"tasks.read",{departmentId:department,clinicId:Number(row.clinicId)}) &&
          resourceAllowed(actor.context,"tasks.review",{departmentId:department,clinicId:Number(row.clinicId)});
      });
      res.setHeader("Cache-Control","private, no-store");
      res.json({approvals:reviewable});
    }catch(error){next(error);}
  });

  app.post("/api/rcm/taskboard/approvals/:approvalId/decision", async(req:Request,res:Response,next:NextFunction)=>{
    if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
    if(req.session.originalUserId||!isSameOriginJson(req))return res.status(403).json({message:"Not permitted"});
    const parsed=decisionSchema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({message:"Invalid decision"});
    let approvalId:number;
    try{approvalId=positiveId.parse(req.params.approvalId);}catch{return res.status(400).json({message:"Invalid approval ID"});}
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const rows=await client.query(
        "SELECT a.*,t.bucket::text AS bucket,t.status::text AS task_status,t.priority::text AS task_priority,t.clinic_id AS \"clinicId\",t.assigned_user_id AS \"assignedUserId\" FROM rcm_task_approvals a JOIN tasks t ON t.id=a.task_id WHERE a.id=$1 FOR UPDATE OF a,t",
        [approvalId],
      );
      const record=rows.rows[0];
      if(!record){await client.query("ROLLBACK");return res.status(404).json({message:"Approval not found"});}
      const department=taskDepartment(record.bucket);
      const scope=department&&record.clinicId?{departmentId:department,clinicId:Number(record.clinicId)}:null;
      const actor=await resolveRcmAccess(req.session.userId);
      if(!scope||!actor||!resourceAllowed(actor.context,"tasks.review",scope)||!resourceAllowed(actor.context,"tasks.read",scope)){
        await client.query("ROLLBACK");return res.status(403).json({message:"Not authorized"});
      }
      if(!canReviewRiskApproval(record.requested_by,req.session.userId)||record.status!=="pending"){
        await client.query("ROLLBACK");return res.status(409).json({message:"Approval is closed or self-review is not allowed"});
      }
      if(!canAssignTaskState(record.bucket,record.task_status)||record.assignedUserId!==record.expected_assignee_id||record.task_priority!==record.risk_level){
        await client.query("ROLLBACK");return res.status(409).json({message:"Task state changed; request a new review"});
      }
      await client.query("UPDATE rcm_task_approvals SET status=$2,reviewed_by=$3,review_note=$4,reviewed_at=now() WHERE id=$1",[approvalId,parsed.data.decision,req.session.userId,parsed.data.note??null]);
      await client.query("INSERT INTO rcm_access_audit(actor_user_id,subject_user_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)",[req.session.userId,record.requested_by,"approval.decided",JSON.stringify({approvalId,taskId:record.task_id,decision:parsed.data.decision})]);
      await client.query("COMMIT");
      res.json({id:approvalId,status:parsed.data.decision});
    }catch(error){await client.query("ROLLBACK");next(error);}
    finally{client.release();}
  });
}
