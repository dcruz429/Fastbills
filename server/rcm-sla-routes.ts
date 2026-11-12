/**
 * SLA monitoring for existing Verification/Billing task due dates.
 * Other trackers have no universally trustworthy due-date field yet.
 */
import type {Express,Request,Response,NextFunction} from "express";
import {pool} from "./db";
import {resolveRcmAccess} from "./rcm-access-service";
import {permissionAllowed} from "../shared/rcm-access-policy";

export const RCM_SLA_SUMMARY_QUERY=`
WITH active AS (
 SELECT t.id,t.due_date,
   CASE WHEN t.bucket='for_verification' THEN 'Verification' ELSE 'Billing' END::text AS department
 FROM tasks t
 WHERE t.bucket IN ('for_verification','ready_for_billing')
   AND t.status NOT IN ('done','dropped','billed','verified')
   AND ($1::boolean OR t.clinic_id=ANY($2::int[]))
)
SELECT department,
 count(*)::integer AS "openTasks",
 count(*) FILTER (WHERE due_date IS NULL)::integer AS "withoutDeadline",
 count(*) FILTER (WHERE due_date IS NOT NULL AND due_date < now())::integer AS "overdue",
 count(*) FILTER (WHERE due_date >= now() AND due_date <= now()+interval '24 hours')::integer AS "dueSoon",
 count(*) FILTER (WHERE due_date > now()+interval '24 hours')::integer AS "onTrack"
FROM active
WHERE department=ANY($3::text[])
GROUP BY department ORDER BY department
`;

export function registerRcmSlaRoutes(app:Express){
 app.get("/api/rcm/sla/summary",async(req:Request,res:Response,next:NextFunction)=>{
  if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
  try{
   const access=await resolveRcmAccess(req.session.userId);
   if(!access||!permissionAllowed(access.context,"sla.read")||!permissionAllowed(access.context,"tasks.read")){
    return res.status(403).json({message:"SLA access denied"});
   }
   const departments=access.context.isSystemAdmin?["Verification","Billing"]:
      ["Verification","Billing"].filter(name=>access.context.departmentIds.has(name));
   const clinicIds=Array.from(access.context.clinicIds);
   res.setHeader("Cache-Control","private, no-store");
   if(departments.length===0||(!access.context.isSystemAdmin&&clinicIds.length===0)){
    return res.json({departments:[],warningHours:24,coverage:"Verification and Billing active tasks"});
   }
   const rows=await pool.query(RCM_SLA_SUMMARY_QUERY,[access.context.isSystemAdmin,clinicIds,departments]);
   res.json({departments:rows.rows,warningHours:24,coverage:"Verification and Billing active tasks"});
  }catch(error){next(error);}
 });
}
