/**
 * Temporary fail-closed ownership boundary for legacy file downloads.
 *
 * file_uploads has no owner_id/parent_id; references are stored as text
 * "/api/files/<id>|<original-name>" in parent attachments arrays.
 * Only direct-message attachments can currently be authorized with strong
 * sender/recipient ownership semantics. All other module attachments
 * deliberately return 404 until module-specific policies are implemented.
 *
 * Must be registered BEFORE legacy /api/files/:id route.
 */
import type {Express, Request, Response, NextFunction} from "express";
import {pool} from "./db";

const idPattern=/^\/(\d+)\/?$/;
export function registerRcmFileDownloadBoundary(app:Express){
 app.use("/api/files",async(req:Request,res:Response,next:NextFunction)=>{
  if(req.method!=="GET"&&req.method!=="HEAD")return res.status(405).json({message:"Method not allowed"});
  if(!req.session.userId)return res.status(401).json({message:"Not authenticated"});
  if(req.session.originalUserId)return res.status(403).json({message:"File downloads unavailable during impersonation"});
  const match=idPattern.exec(req.path);
  if(!match)return res.status(404).json({message:"File not found"});
  const fileId=Number(match[1]);
  if(!Number.isSafeInteger(fileId)||fileId<1)return res.status(404).json({message:"File not found"});
  const reference="/api/files/"+fileId;
  try{
   const result=await pool.query(
    `SELECT
       (SELECT count(*)::int FROM direct_messages m
          WHERE EXISTS (SELECT 1 FROM unnest(m.attachments) a WHERE split_part(a,'|',1)=$1)) AS dm_references,
       (SELECT count(*)::int FROM direct_messages m
          WHERE (m.sender_id=$2 OR m.recipient_id=$2)
            AND EXISTS (SELECT 1 FROM unnest(m.attachments) a WHERE split_part(a,'|',1)=$1)) AS allowed_dm_references,
       (
         (SELECT count(*) FROM announcements p WHERE EXISTS (SELECT 1 FROM unnest(p.attachments) a WHERE split_part(a,'|',1)=$1))
        +(SELECT count(*) FROM guideline_modules p WHERE EXISTS (SELECT 1 FROM unnest(p.attachments) a WHERE split_part(a,'|',1)=$1))
        +(SELECT count(*) FROM tickets p WHERE EXISTS (SELECT 1 FROM unnest(p.attachments) a WHERE split_part(a,'|',1)=$1))
        +(SELECT count(*) FROM ticket_comments p WHERE EXISTS (SELECT 1 FROM unnest(p.attachments) a WHERE split_part(a,'|',1)=$1))
        +(SELECT count(*) FROM ceo_box p WHERE EXISTS (SELECT 1 FROM unnest(p.attachments) a WHERE split_part(a,'|',1)=$1))
       )::int AS other_references`,
    [reference,req.session.userId],
   );
   const row=result.rows[0];
   // A file linked to another person's DM or to an unreviewed module is
   // blocked, even if that same file is also linked to an allowed DM.
   if(!row || Number(row.dm_references)!==1 || Number(row.allowed_dm_references)!==1 ||
      Number(row.other_references)!==0){
    return res.status(404).json({message:"File not found"});
   }
   res.setHeader("Cache-Control","private, no-store");
   res.setHeader("X-Content-Type-Options","nosniff");
   next();
  }catch(error){next(error);}
 });
}
