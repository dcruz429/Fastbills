/**
 * Independent QA on completed existing Verification/Billing task records.
 * Does not alter original task status or patient fields.
 */
import type {Express,Request,Response,NextFunction} from "express";
import {z} from "zod";
import {pool} from "./db";
import {resolveRcmAccess} from "./rcm-access-service";
import {resourceAllowed} from "../shared/rcm-access-policy";
import {canQualityReview,taskQaDepartment} from "../shared/rcm-quality-policy";

const reviewSchema=z.object({
 taskId:z.number().int().positive(),
 score:z.number().int().min(0).max(100),
 verdict:z.enum(["passed","needs_correction"]),
 note:z.string().trim().max(1000).optional(),
}).strict();
function sameOrigin(req:Request):boolean{
 if(!req.is("application/json"))return false;
 const site=req.get("sec-fetch-site");if(site&&site!=="same-origin"&&site!=="none")return false;
 const origin=req.get("origin");if(!origin)return true;
 try{return new URL(origin).host===req.get("host");}catch{return false;}
}
export function registerRcmQualityRoutes(app:Express){
 app.get("/api/rcm/quality/queue",async(req:Request,res:Response,next:NextFunction)=>{
  if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
  if(req.session.originalUserId)return res.status(403).json({message:"Quality review unavailable during impersonation"});
  try{
   const access=await resolveRcmAccess(req.session.userId);
   if(!access)return res.status(403).json({message:"Not authorized"});
   const rows=await pool.query(
     `SELECT t.id,t.patient_name AS "patientName",t.bucket::text AS bucket,t.status::text AS status,
       t.clinic_id AS "clinicId",c.name AS "clinicName",t.assigned_user_id AS "assignedUserId"
       FROM tasks t LEFT JOIN clinics c ON c.id=t.clinic_id
       WHERE (t.bucket='done' OR t.status IN ('done','billed','verified'))
         AND t.assigned_user_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM rcm_quality_reviews q WHERE q.source='tasks' AND q.record_id=t.id)
       ORDER BY t.created_at DESC,t.id DESC LIMIT 500`,
   );
   const queue=rows.rows.filter(row=>{
     const dept=taskQaDepartment(row.bucket,row.status);
     const scope=dept&&row.clinicId?{departmentId:dept,clinicId:Number(row.clinicId)}:null;
     return !!scope &&
      canQualityReview(req.session.userId!,row.assignedUserId,true) &&
      resourceAllowed(access.context,"tasks.read",scope) &&
      resourceAllowed(access.context,"tasks.review",scope);
   });
   res.setHeader("Cache-Control","private, no-store");res.json({queue});
  }catch(error){next(error);}
 });
 app.post("/api/rcm/quality/reviews",async(req:Request,res:Response,next:NextFunction)=>{
  if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
  if(req.session.originalUserId||!sameOrigin(req))return res.status(403).json({message:"Not permitted"});
  const parsed=reviewSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({message:"Invalid quality review"});
  const {taskId,score,verdict,note}=parsed.data;
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const found=await client.query(
     "SELECT id,bucket::text AS bucket,status::text AS status,assigned_user_id AS \"assignedUserId\",clinic_id AS \"clinicId\" FROM tasks WHERE id=$1 FOR UPDATE",
     [taskId],
   );
   const task=found.rows[0];
   if(!task){await client.query("ROLLBACK");return res.status(404).json({message:"Task not found"});}
   const dept=taskQaDepartment(task.bucket,task.status);
   if(!dept||!task.clinicId||!canQualityReview(req.session.userId,task.assignedUserId,true)){
    await client.query("ROLLBACK");return res.status(403).json({message:"Task is not eligible for independent review"});
   }
   const actor=await resolveRcmAccess(req.session.userId);
   const scope={departmentId:dept,clinicId:Number(task.clinicId)};
   if(!actor||!resourceAllowed(actor.context,"tasks.read",scope)||!resourceAllowed(actor.context,"tasks.review",scope)){
    await client.query("ROLLBACK");return res.status(403).json({message:"Review not authorized for clinic and department"});
   }
   const existing=await client.query("SELECT id FROM rcm_quality_reviews WHERE source='tasks' AND record_id=$1 LIMIT 1",[taskId]);
   if(existing.rowCount){await client.query("ROLLBACK");return res.status(409).json({message:"Task already reviewed"});
   }
   const inserted=await client.query(
     "INSERT INTO rcm_quality_reviews(source,record_id,reviewer_id,reviewed_assignee_id,department_key,clinic_id,verdict,score,note) VALUES('tasks',$1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
     [taskId,req.session.userId,task.assignedUserId,dept,scope.clinicId,verdict,score,note||null],
   );
   await client.query(
     "INSERT INTO rcm_access_audit(actor_user_id,subject_user_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)",
     [req.session.userId,task.assignedUserId,"qa.review",JSON.stringify({source:"tasks",recordId:taskId,reviewId:inserted.rows[0].id,verdict,score})],
   );
   await client.query("COMMIT");
   res.status(201).json({id:inserted.rows[0].id,verdict,score});
  }catch(error){await client.query("ROLLBACK");next(error);}
  finally{client.release();}
 });
}
