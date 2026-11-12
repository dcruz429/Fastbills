/**
 * Weighted productivity summary from existing tracker completion events.
 * The only returned employee information is ID + display name + aggregates.
 * SQL applies both department and clinic scope before returning event rows.
 * Historical activity is retained; duplicate completion events per record are
 * deduplicated in the scoring policy.
 */
import type { Express,Request,Response,NextFunction } from "express";
import {z} from "zod";
import {pool} from "./db";
import {resolveRcmAccess} from "./rcm-access-service";
import {permissionAllowed} from "../shared/rcm-access-policy";
import {allowedBoardDepartments} from "../shared/rcm-taskboard-scope";
import {scoreCompletions,DEFAULT_RCM_WEIGHTS,type CompletionEvent} from "../shared/rcm-productivity-policy";

const dateSchema=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const configSchema=z.object({department:z.enum([
  "Verification","Billing","Posting","Collections","Denials","Arbitration","Checks","Case Management / RTP","Closed",
]),weight:z.number().finite().min(0).max(100)}).strict();

function safeDate(raw:unknown,backDays:number):string|null{
  if(raw===undefined){
    const dt=new Date(Date.now()-backDays*86400000);
    return dt.toISOString().slice(0,10);
  }
  const parsed=dateSchema.safeParse(raw);
  if(!parsed.success||!Number.isFinite(Date.parse(parsed.data+"T00:00:00Z")))return null;
  return parsed.data;
}
function sameOriginJson(req:Request):boolean{
  if(!req.is("application/json"))return false;
  const origin=req.get("origin");
  const site=req.get("sec-fetch-site");
  if(site&&site!=="same-origin"&&site!=="none")return false;
  if(!origin)return true;
  try{return new URL(origin).host===req.get("host");}catch{return false;}
}

export const PRODUCTIVITY_COMPLETIONS_QUERY=`
WITH clinic_aliases AS (
 SELECT lower(btrim(name)) AS normalized_name,min(id) AS clinic_id
 FROM clinics GROUP BY lower(btrim(name)) HAVING count(*)=1
), events AS (
 SELECT 'tasks'::text source,ta.task_id record_id,ta.user_id employee_id,
  CASE WHEN ta.new_value='verified' THEN 'Verification' ELSE 'Billing' END::text department,
  t.clinic_id clinic_id, ta.timestamp completed_at
 FROM task_activity ta JOIN tasks t ON t.id=ta.task_id
 WHERE ta.field='status' AND ta.new_value IN ('done','billed','verified') AND
       (t.status IN ('done','billed','verified') OR t.bucket='done')
 UNION ALL
 SELECT 'postings',pa.posting_id,pa.user_id,'Posting',ca.clinic_id,pa.timestamp
 FROM posting_activity pa JOIN postings p ON p.id=pa.posting_id
 LEFT JOIN clinic_aliases ca ON ca.normalized_name=lower(btrim(p.clinic))
 WHERE pa.field='status' AND lower(pa.new_value)='done' AND lower(coalesce(p.posting_status,''))='done'
 UNION ALL
 SELECT 'collections',ca2.collection_id,ca2.user_id,'Collections',ca.clinic_id,ca2.timestamp
 FROM collection_activity ca2 JOIN collections c ON c.id=ca2.collection_id
 LEFT JOIN clinic_aliases ca ON ca.normalized_name=lower(btrim(c.clinic))
 WHERE ca2.field='status' AND lower(ca2.new_value)='done' AND lower(coalesce(c.collection_status,''))='done'
 UNION ALL
 SELECT 'denials',da.denial_id,da.user_id,'Denials',ca.clinic_id,da.timestamp
 FROM denial_activity da JOIN denials d ON d.id=da.denial_id
 LEFT JOIN clinic_aliases ca ON ca.normalized_name=lower(btrim(d.clinic))
 WHERE da.field='status' AND lower(da.new_value)='done' AND lower(coalesce(d.denial_status,''))='done'
 UNION ALL
 SELECT 'arbitrations',aa.arbitration_id,aa.user_id,'Arbitration',ca.clinic_id,aa.timestamp
 FROM arbitration_activity aa JOIN arbitrations a ON a.id=aa.arbitration_id
 LEFT JOIN clinic_aliases ca ON ca.normalized_name=lower(btrim(a.clinic))
 WHERE aa.field='status' AND lower(aa.new_value)='done' AND lower(coalesce(a.arbitration_status,''))='done'
 UNION ALL
 SELECT 'checks',xa.check_id,xa.user_id,'Checks',ca.clinic_id,xa.timestamp
 FROM check_activity xa JOIN checks x ON x.id=xa.check_id
 LEFT JOIN clinic_aliases ca ON ca.normalized_name=lower(btrim(x.clinic))
 WHERE xa.field='status' AND lower(xa.new_value)='done' AND lower(coalesce(x.check_status,''))='done'
 UNION ALL
 SELECT 'closed',za.closed_id,za.user_id,
  CASE WHEN z.source ILIKE 'RTP%' THEN 'Case Management / RTP' ELSE 'Closed' END,
  ca.clinic_id,za.timestamp
 FROM closed_activity za JOIN closed z ON z.id=za.closed_id
 LEFT JOIN clinic_aliases ca ON ca.normalized_name=lower(btrim(z.clinic))
 WHERE za.field='status' AND lower(za.new_value)='done' AND lower(coalesce(z.closed_status,''))='done'
)
SELECT source,"recordId","employeeId",department,"completedAt",u.full_name AS "employeeName"
FROM (
 SELECT source,record_id AS "recordId",employee_id AS "employeeId",
        department,completed_at AS "completedAt"
 FROM events
 WHERE completed_at >= $4::timestamp AND completed_at < ($5::date+interval '1 day')
   AND department = ANY($3::text[])
   AND ($1::boolean OR clinic_id = ANY($2::int[]))
   AND employee_id IS NOT NULL
) q
JOIN users u ON u.id=q."employeeId"
ORDER BY "completedAt" DESC,source,"recordId"
LIMIT 20001
`;

export function registerRcmProductivityRoutes(app:Express){
  app.get("/api/rcm/productivity/weights",async(req:Request,res:Response,next:NextFunction)=>{
    if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
    try{
      const actor=await resolveRcmAccess(req.session.userId);
      if(!actor||!permissionAllowed(actor.context,"productivity.read"))return res.status(403).json({message:"Not authorized"});
      const result=await pool.query("SELECT department_key AS department, weight::float AS weight FROM rcm_productivity_weights ORDER BY department_key");
      res.setHeader("Cache-Control","private, no-store");res.json({weights:Object.fromEntries(result.rows.map(row=>[row.department,row.weight]))});
    }catch(error){next(error);}
  });
  app.put("/api/rcm/productivity/weights",async(req:Request,res:Response,next:NextFunction)=>{
    if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
    if(req.session.originalUserId||!sameOriginJson(req))return res.status(403).json({message:"Not permitted"});
    const parsed=configSchema.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({message:"Invalid productivity weight"});
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const actor=await client.query("SELECT id,role,active FROM users WHERE id=$1",[req.session.userId]);
      if(!actor.rowCount||actor.rows[0].role!=="admin"||!actor.rows[0].active){
        await client.query("ROLLBACK");return res.status(403).json({message:"System administrator required"});
      }
      await client.query(
        "INSERT INTO rcm_productivity_weights(department_key,weight,updated_by) VALUES($1,$2,$3) ON CONFLICT(department_key) DO UPDATE SET weight=EXCLUDED.weight,updated_by=EXCLUDED.updated_by,updated_at=now()",
        [parsed.data.department,parsed.data.weight,req.session.userId],
      );
      await client.query("INSERT INTO rcm_access_audit(actor_user_id,event_type,payload) VALUES($1,$2,$3::jsonb)",[
        req.session.userId,"productivity.weight",JSON.stringify(parsed.data),
      ]);
      await client.query("COMMIT");
      res.json({ok:true});
    }catch(error){await client.query("ROLLBACK");next(error);}
    finally{client.release();}
  });
  app.get("/api/rcm/productivity/summary",async(req:Request,res:Response,next:NextFunction)=>{
    if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
    const from=safeDate(req.query.from,30);
    const to=safeDate(req.query.to,0);
    if(!from||!to||from>to)return res.status(400).json({message:"Invalid date range"});
    const days=(Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000;
    if(days>93)return res.status(400).json({message:"Date range cannot exceed 94 days"});
    try{
      const actor=await resolveRcmAccess(req.session.userId);
      if(!actor||!permissionAllowed(actor.context,"productivity.read"))return res.status(403).json({message:"Not authorized"});
      const departments=allowedBoardDepartments(actor.context);
      const clinics=Array.from(actor.context.clinicIds);
      res.setHeader("Cache-Control","private, no-store");
      if(departments.length===0||(!actor.context.isSystemAdmin&&clinics.length===0)){
        return res.json({from,to,completions:0,units:0,byDepartment:{},leaderboard:[],truncated:false});
      }
      const [weightsRows,eventsRows]=await Promise.all([
        pool.query("SELECT department_key,weight::float FROM rcm_productivity_weights"),
        pool.query(PRODUCTIVITY_COMPLETIONS_QUERY,[actor.context.isSystemAdmin,clinics,departments,from,to]),
      ]);
      const weights={...DEFAULT_RCM_WEIGHTS,...Object.fromEntries(weightsRows.rows.map(r=>[r.department_key,Number(r.weight)]))};
      const truncated=eventsRows.rows.length>20000;
      const events=eventsRows.rows.slice(0,20000) as Array<CompletionEvent & {employeeName:string}>;
      const summary=scoreCompletions(events,weights);
      const groups=new Map<number,{id:number;name:string;events:CompletionEvent[]}>();
      for(const event of events){
        const id=Number(event.employeeId);
        const group=groups.get(id)||{id,name:event.employeeName,events:[]};
        group.events.push(event);groups.set(id,group);
      }
      const leaderboard=Array.from(groups.values()).map(group=>({
        userId:group.id,name:group.name,...scoreCompletions(group.events,weights),
      })).sort((a,b)=>b.units-a.units||b.completions-a.completions).slice(0,100);
      res.json({from,to,...summary,leaderboard,truncated});
    }catch(error){next(error);}
  });
}
