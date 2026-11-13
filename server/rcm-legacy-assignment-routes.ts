/**
 * Scoped assignment adapters for legacy free-text-assignee trackers.
 * Values are written to the EXISTING assigned_to columns with existing
 * activity history tables; source-controlled identifier allowlist only.
 * High/critical legacy assignments remain blocked pending dedicated review.
 */
import type {Express,Request,Response,NextFunction} from "express";
import {z} from "zod";
import {pool} from "./db";
import {resolveRcmAccess} from "./rcm-access-service";
import {resourceAllowed,permissionAllowed} from "../shared/rcm-access-policy";
import {
  LEGACY_ASSIGNMENT_SOURCES,legacyAssignmentDepartment,canAssignLegacyStatus,
  nextLegacyStatus,mustBlockLegacyHighRisk,type LegacyAssignmentSource,
} from "../shared/rcm-legacy-assignment-policy";

const idSchema=z.coerce.number().int().positive();
const bodySchema=z.object({
 assignedUserId:z.number().int().positive().nullable(),
 expectedAssignedName:z.string().max(250).nullable(),
}).strict();

function resolveSource(raw:string):LegacyAssignmentSource|null{
 return Object.prototype.hasOwnProperty.call(LEGACY_ASSIGNMENT_SOURCES,raw)?raw as LegacyAssignmentSource:null;
}
function sameOriginJson(req:Request):boolean{
 if(!req.is("application/json"))return false;
 const site=req.get("sec-fetch-site");
 if(site&&site!=="same-origin"&&site!=="none")return false;
 const origin=req.get("origin");
 if(!origin)return true;
 try{return new URL(origin).host===req.get("host");}catch{return false;}
}
function selectionSql(source:LegacyAssignmentSource):string{
 const config=LEGACY_ASSIGNMENT_SOURCES[source];
 const priority=(source==="postings"||source==="collections"||source==="closed")?"priority":"NULL::text";
 const originalSource=source==="closed"?"source":"NULL::text";
 return `SELECT id,clinic,assigned_to AS "assignedName",${config.status} AS status,${priority} AS priority,
      ${originalSource} AS "originalSource" FROM ${config.table} WHERE id=$1 FOR UPDATE`;
}
function readSql(source:LegacyAssignmentSource):string{
 return selectionSql(source).replace(" FOR UPDATE","");
}
type LegacyRow={id:number;clinic:string|null;assignedName:string|null;status:string|null;priority:string|null;originalSource:string|null};
async function clinicScope(row:LegacyRow):Promise<number|null>{
 if(!row.clinic?.trim())return null;
 const clinics=await pool.query("SELECT id FROM clinics WHERE lower(btrim(name))=lower(btrim($1))",[row.clinic]);
 return clinics.rowCount===1?Number(clinics.rows[0].id):null;
}
async function canAccess(userId:number,department:string,clinicId:number,permission:"tasks.read"|"tasks.assign"){
 const actor=await resolveRcmAccess(userId);
 if(!actor)return false;
 const scope={departmentId:department,clinicId};
 if(department==="Checks"&&!permissionAllowed(actor.context,"checks.read"))return false;
 return resourceAllowed(actor.context,permission,scope);
}
export function registerRcmLegacyAssignmentRoutes(app:Express){
 app.get("/api/rcm/taskboard/legacy/:source/:recordId/assignees",async(req:Request,res:Response,next:NextFunction)=>{
  if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
  if(req.session.originalUserId)return res.status(403).json({message:"Unavailable during impersonation"});
  const source=resolveSource(String(req.params.source));
  if(!source)return res.status(400).json({message:"Invalid tracker source"});
  let id:number;try{id=idSchema.parse(req.params.recordId);}catch{return res.status(400).json({message:"Invalid record ID"});}
  try{
   const record=await pool.query(readSql(source),[id]);
   const row=record.rows[0] as LegacyRow|undefined;
   if(!row)return res.status(404).json({message:"Record not found"});
   const department=legacyAssignmentDepartment(source,row.originalSource);
   const clinicId=await clinicScope(row);
   if(!clinicId||!await canAccess(req.session.userId,department,clinicId,"tasks.read")||
     !await canAccess(req.session.userId,department,clinicId,"tasks.assign")){
     return res.status(403).json({message:"Not authorized to assign this record"});
   }
   if(!canAssignLegacyStatus(row.status))return res.status(409).json({message:"Record already completed"});
   if(mustBlockLegacyHighRisk(row.priority))return res.status(428).json({message:"Legacy high-risk assignment requires a separate review workflow"});
   const users=await pool.query("SELECT id,full_name AS \"fullName\" FROM users WHERE active=true ORDER BY full_name,id LIMIT 500");
   const allowed:{id:number;fullName:string}[]=[];
   for(const u of users.rows){
    const duplicates=users.rows.filter(other=>other.fullName.trim().toLowerCase()===u.fullName.trim().toLowerCase());
    if(duplicates.length!==1)continue;
    if(await canAccess(u.id,department,clinicId,"tasks.read"))allowed.push(u);
   }
   res.setHeader("Cache-Control","private, no-store");
   res.json({users:allowed,currentAssignedName:row.assignedName});
  }catch(error){next(error);}
 });

 app.patch("/api/rcm/taskboard/legacy/:source/:recordId/assignee",async(req:Request,res:Response,next:NextFunction)=>{
  if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
  if(req.session.originalUserId||!sameOriginJson(req))return res.status(403).json({message:"Not permitted"});
  const source=resolveSource(String(req.params.source));
  if(!source)return res.status(400).json({message:"Invalid tracker source"});
  let id:number;try{id=idSchema.parse(req.params.recordId);}catch{return res.status(400).json({message:"Invalid record ID"});}
  const parsed=bodySchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({message:"Invalid assignment request"});
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const rowResult=await client.query(selectionSql(source),[id]);
   const row=rowResult.rows[0] as LegacyRow|undefined;
   if(!row){await client.query("ROLLBACK");return res.status(404).json({message:"Record not found"});}
   const department=legacyAssignmentDepartment(source,row.originalSource);
   const clinics=await client.query("SELECT id FROM clinics WHERE lower(btrim(name))=lower(btrim($1))",[row.clinic]);
   if(clinics.rowCount!==1){await client.query("ROLLBACK");return res.status(403).json({message:"Clinic does not resolve uniquely"});}
   const clinicId=Number(clinics.rows[0].id);
   if(!await canAccess(req.session.userId,department,clinicId,"tasks.read")||
     !await canAccess(req.session.userId,department,clinicId,"tasks.assign")){
      await client.query("ROLLBACK");return res.status(403).json({message:"Not authorized for this clinic and department"});
   }
   if(!canAssignLegacyStatus(row.status)){await client.query("ROLLBACK");return res.status(409).json({message:"Completed records cannot be reassigned"});}
   if(mustBlockLegacyHighRisk(row.priority)){await client.query("ROLLBACK");return res.status(428).json({message:"Independent high-risk approval required"});}
   if((row.assignedName||null)!==(parsed.data.expectedAssignedName||null)){
    await client.query("ROLLBACK");return res.status(409).json({message:"Assignment changed. Refresh and retry"});
   }
   let newName:string|null=null;
   if(parsed.data.assignedUserId!==null){
    const result=await client.query("SELECT id,full_name FROM users WHERE id=$1 AND active=true",[parsed.data.assignedUserId]);
    if(result.rowCount!==1){await client.query("ROLLBACK");return res.status(403).json({message:"User inactive or not found"});}
    newName=String(result.rows[0].full_name);
    const duplicates=await client.query("SELECT count(*)::integer AS count FROM users WHERE active=true AND lower(btrim(full_name))=lower(btrim($1))",[newName]);
    if(duplicates.rows[0].count!==1){
      await client.query("ROLLBACK");return res.status(409).json({message:"Employee name not unique; cannot safely match legacy assignee"});
    }
    if(!await canAccess(parsed.data.assignedUserId,department,clinicId,"tasks.read")){
     await client.query("ROLLBACK");return res.status(403).json({message:"Selected employee not authorized for clinic and department"});
    }
   }
   if((row.assignedName||null)===newName){await client.query("COMMIT");return res.json({ok:true,unchanged:true});}
   const config=LEGACY_ASSIGNMENT_SOURCES[source];
   const newStatus=nextLegacyStatus(row.status,newName!==null);
   await client.query(`UPDATE ${config.table} SET assigned_to=$2,${config.status}=$3 WHERE id=$1`,[id,newName,newStatus]);
   await client.query(
     `INSERT INTO ${config.activity}(${config.activityId},user_id,action,field,old_value,new_value) VALUES($1,$2,$3,$4,$5,$6)`,
     [id,req.session.userId,"RCM Task Board assignment changed","assignedTo",row.assignedName,newName],
   );
   if(newStatus!==row.status){
     await client.query(
       `INSERT INTO ${config.activity}(${config.activityId},user_id,action,field,old_value,new_value) VALUES($1,$2,$3,$4,$5,$6)`,
       [id,req.session.userId,"RCM Task Board status updated","status",row.status,newStatus],
     );
   }
   await client.query("INSERT INTO rcm_access_audit(actor_user_id,subject_user_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)",[
     req.session.userId,parsed.data.assignedUserId,"legacy.assignment",JSON.stringify({source,recordId:id,department,clinicId,oldAssignee:row.assignedName,newAssignee:newName}),
   ]);
   await client.query("COMMIT");
   res.setHeader("Cache-Control","private, no-store");
   res.json({ok:true,itemKey:source+":"+id,assignedUserId:parsed.data.assignedUserId,assigneeName:newName,status:newStatus});
  }catch(error){await client.query("ROLLBACK");next(error);}
  finally{client.release();}
 });
}
