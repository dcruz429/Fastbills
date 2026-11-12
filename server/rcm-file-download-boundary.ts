/**
 * Temporary fail-closed ownership boundary for legacy file downloads.
 *
 * file_uploads has no owner_id/parent_id; references are stored as text
 * "/api/files/<id>|<original-name>" in parent attachments arrays.
 * Direct-message attachments require sender/recipient ownership. Guidelines
 * attachments are readable by active signed-in users, provided they belong to
 * exactly one module and no other parent. Tickets and ticket-comment files
 * require an active administrator and a single eligible parent reference.
 * Announcements require their intended audience or the author (for
 * targeted messages), with a unique attachment parent. CEO Box still fails closed.
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
       (SELECT active FROM users WHERE id=$2) AS active,
       (SELECT role::text FROM users WHERE id=$2) AS actor_role,
       (SELECT count(*)::int FROM direct_messages m
          WHERE EXISTS (SELECT 1 FROM unnest(m.attachments) a WHERE split_part(a,'|',1)=$1)) AS dm_references,
       (SELECT count(*)::int FROM direct_messages m
          WHERE (m.sender_id=$2 OR m.recipient_id=$2)
            AND EXISTS (SELECT 1 FROM unnest(m.attachments) a WHERE split_part(a,'|',1)=$1)) AS allowed_dm_references,
       (SELECT count(*)::int FROM guideline_modules g
          WHERE EXISTS (SELECT 1 FROM unnest(g.attachments) a WHERE split_part(a,'|',1)=$1)) AS guideline_references,
       (SELECT count(*)::int FROM tickets t
          WHERE EXISTS (SELECT 1 FROM unnest(t.attachments) a WHERE split_part(a,'|',1)=$1)) AS ticket_references,
       (SELECT count(*)::int FROM ticket_comments t
          JOIN tickets parent ON parent.id=t.ticket_id
          WHERE EXISTS (SELECT 1 FROM unnest(t.attachments) a WHERE split_part(a,'|',1)=$1)) AS ticket_comment_references,
       (SELECT count(*)::int FROM announcements p
          WHERE EXISTS (SELECT 1 FROM unnest(p.attachments) a WHERE split_part(a,'|',1)=$1)) AS announcement_references,
       (SELECT count(*)::int FROM announcements p
          WHERE EXISTS (SELECT 1 FROM unnest(p.attachments) a WHERE split_part(a,'|',1)=$1)
            AND (p.author_id=$2 OR p.target_type='all'
              OR (p.target_type='users' AND $2=ANY(p.target_user_ids))
              OR (p.target_type='role' AND (SELECT role::text FROM users WHERE id=$2)=ANY(p.target_roles)))
       ) AS allowed_announcement_references,
       (SELECT count(*)::int FROM ceo_box p
          WHERE EXISTS (SELECT 1 FROM unnest(p.attachments) a WHERE split_part(a,'|',1)=$1)) AS other_references`,
    [reference,req.session.userId],
   );
   const row=result.rows[0];
   // Even stale sessions must not grant file access to inactive accounts.
   if(!row || row.active!==true)return res.status(403).json({message:"File access denied"});
   const dmCount=Number(row.dm_references);
   const guidelineCount=Number(row.guideline_references);
   const ticketCount=Number(row.ticket_references);
   const commentCount=Number(row.ticket_comment_references);
   const announcementCount=Number(row.announcement_references);
   const otherCount=Number(row.other_references);
   const privateDmAllowed=dmCount===1 && Number(row.allowed_dm_references)===1 &&
     guidelineCount===0 && ticketCount===0 && commentCount===0 && announcementCount===0 && otherCount===0;
   const guidelineAllowed=guidelineCount===1 && dmCount===0 &&
     ticketCount===0 && commentCount===0 && announcementCount===0 && otherCount===0;
   // Ticket and ticket-comment parent routes are currently admin-only.
   // A reference in both tables, even within the same ticket, is ambiguous.
   const ticketAllowed=row.actor_role==="admin" && dmCount===0 && guidelineCount===0 &&
     announcementCount===0 && otherCount===0 && ticketCount+commentCount===1;
   const announcementAllowed=announcementCount===1 && Number(row.allowed_announcement_references)===1 &&
     dmCount===0 && guidelineCount===0 && ticketCount===0 && commentCount===0 && otherCount===0;
   // Never accept orphan files or links shared between different modules.
   if(!privateDmAllowed && !guidelineAllowed && !ticketAllowed && !announcementAllowed){
    return res.status(404).json({message:"File not found"});
   }
   res.setHeader("Cache-Control","private, no-store");
   res.setHeader("X-Content-Type-Options","nosniff");
   next();
  }catch(error){next(error);}
 });
}
