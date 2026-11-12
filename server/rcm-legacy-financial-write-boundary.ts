/**
 * Central write boundary for historical financial tracker API routes.
 * Registered BEFORE any legacy handlers. Reads are not intercepted.
 *
 * Fail-closed on unknown/bulk CSV formats for non-admins; legacy transfer,
 * assignee and clinic editing paths are not considered scoped workflows.
 * A system admin can retain existing legacy functionality but must be active.
 * Admin bypass is still a release-review item; this guard does not claim to
 * authorize every legacy administrative mutation or export.
 */
import type {Express,Request,Response,NextFunction} from "express";
import { pool } from "./db";
import { resolveRcmAccess } from "./rcm-access-service";
import { permissionAllowed, resourceAllowed } from "../shared/rcm-access-policy";

const FAMILIES={
 denials:{table:"denials",department:"Denials"},
 checks:{table:"checks",department:"Checks"},
 arbitrations:{table:"arbitrations",department:"Arbitration"},
 collections:{table:"collections",department:"Collections"},
 postings:{table:"postings",department:"Posting"},
 closed:{table:"closed",department:"RTP"},
} as const;

function recordId(raw:unknown):number|null{
 const n=Number(raw);
 return Number.isSafeInteger(n)&&n>0?n:null;
}
async function clinicAliases(){
 const r=await pool.query(
  "SELECT lower(btrim(name)) AS name,min(id)::int AS id FROM clinics GROUP BY lower(btrim(name)) HAVING count(*)=1"
 );
 return new Map<string,number>(r.rows.map(row=>[String(row.name),Number(row.id)]));
}
export function registerLegacyFinancialWriteBoundary(app:Express){
 for(const family of ["denials","checks","arbitrations","collections","postings","closed"] as const){
  const config=FAMILIES[family];
  app.use("/api/"+family,async(req:Request,res:Response,next:NextFunction)=>{
   if(!["POST","PATCH","PUT","DELETE"].includes(req.method))return next();
   if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
   if(req.session.originalUserId)return res.status(403).json({message:"Unavailable during impersonation"});
   try{
    const access=await resolveRcmAccess(req.session.userId);
    if(!access)return res.status(403).json({message:"Access denied"});
    // Only original system admins can use the non-scoped legacy import and
    // transfer capabilities while those handlers await redesign.
    const isAdmin=access.context.isSystemAdmin;
    if(isAdmin)return next();
    const method=req.method;
    const suffix=req.path;
    if(suffix==="/import-csv" || suffix==="/remove-duplicates" || suffix==="/fix-assigned" || suffix==="/export" ||
       suffix.endsWith("/send-to-arbitration")){
      return res.status(403).json({message:"Legacy import/transfer requires a scoped workflow"});
    }
    // Checks require their own permission as well as the department scope.
    if(family==="checks"){
     if(!permissionAllowed(access.context,"checks.read"))
      return res.status(403).json({message:"Checks permission required"});
    }
    const body=req.body ?? {};
    const isCreate=req.path==="/" && method==="POST";
    // Creation may specify its own existing, uniquely resolvable clinic,
    // but not a preassigned employee or cross-tracker transfer.
    const prohibited=isCreate?["assignedTo","outcome"]:["clinic","assignedTo","outcome"];
    if(prohibited.some(field=>Object.prototype.hasOwnProperty.call(body,field)) ||
       (body.data&&prohibited.some(field=>Object.prototype.hasOwnProperty.call(body.data,field)))){
      return res.status(403).json({message:"Clinic, assignee and transfer changes require a scoped workflow"});
    }
    const aliases=await clinicAliases();
    const allowed=(clinic:string|null|undefined,permission:"tasks.create"|"tasks.update"|"tasks.close")=>{
     const key=typeof clinic==="string"?clinic.trim().toLowerCase():"";
     const id=aliases.get(key);
     return id!==undefined && resourceAllowed(access.context,permission,{departmentId:config.department,clinicId:id});
    };
    if(suffix==="/" && method==="POST"){
      if(!allowed(body.clinic,"tasks.create"))
       return res.status(403).json({message:"Create is outside the assigned clinic and department"});
      return next();
    }
    const bulk=suffix==="/bulk-update" || suffix==="/bulk-delete";
    if(bulk){
     if(method!=="POST" || !Array.isArray(body.ids) || body.ids.length===0 || body.ids.length>500)
      return res.status(403).json({message:"Invalid scoped bulk operation"});
     const ids=body.ids.map(recordId);
     if(ids.some((id:number|null)=>id===null)||new Set(ids).size!==ids.length)
      return res.status(403).json({message:"Invalid scoped bulk IDs"});
     const result=await pool.query(`SELECT id,clinic FROM ${config.table} WHERE id=ANY($1::int[])`,[ids]);
     if(result.rows.length!==ids.length ||
        result.rows.some(row=>!allowed(row.clinic,suffix==="/bulk-delete"?"tasks.close":"tasks.update")))
       return res.status(403).json({message:"Bulk operation includes an unauthorized record"});
     return next();
    }
    const match=/^\/(\d+)(?:\/notes)?$/.exec(suffix);
    if(!match || !["PATCH","POST","DELETE"].includes(method))
     return res.status(403).json({message:"Legacy write route not authorized"});
    const id=recordId(match[1]);
    if(id===null)return res.status(400).json({message:"Invalid record ID"});
    if(method==="POST" && !suffix.endsWith("/notes"))
     return res.status(403).json({message:"Legacy operation requires scoped workflow"});
    const record=await pool.query(`SELECT clinic FROM ${config.table} WHERE id=$1`,[id]);
    if(record.rowCount!==1)return res.status(404).json({message:"Record not found"});
    if(!allowed(record.rows[0].clinic,method==="DELETE"?"tasks.close":"tasks.update"))
     return res.status(404).json({message:"Record not found"});
    next();
   }catch(error){next(error);}
  });
 }
}
