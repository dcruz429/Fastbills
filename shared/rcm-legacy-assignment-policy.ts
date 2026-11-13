/**
 * Strict allowlist of legacy trackers for the staged manager assignment API.
 * Identifiers are source-controlled, never interpolated from user input.
 * Original tables, status columns and activity tables are preserved.
 */
export const LEGACY_ASSIGNMENT_SOURCES={
  postings:{table:"postings",status:"posting_status",activity:"posting_activity",activityId:"posting_id",department:"Posting"},
  collections:{table:"collections",status:"collection_status",activity:"collection_activity",activityId:"collection_id",department:"Collections"},
  denials:{table:"denials",status:"denial_status",activity:"denial_activity",activityId:"denial_id",department:"Denials"},
  arbitrations:{table:"arbitrations",status:"arbitration_status",activity:"arbitration_activity",activityId:"arbitration_id",department:"Arbitration"},
  checks:{table:"checks",status:"check_status",activity:"check_activity",activityId:"check_id",department:"Checks"},
  closed:{table:"closed",status:"closed_status",activity:"closed_activity",activityId:"closed_id",department:"Closed"},
} as const;
export type LegacyAssignmentSource=keyof typeof LEGACY_ASSIGNMENT_SOURCES;
export function legacyAssignmentDepartment(source:LegacyAssignmentSource,originalSource:string|null):string{
  if(source==="closed" && /^RTP/i.test(originalSource||""))return "Case Management / RTP";
  return LEGACY_ASSIGNMENT_SOURCES[source].department;
}
export function canAssignLegacyStatus(status:string|null):boolean{
  return !["done","closed","dropped"].includes((status||"").trim().toLowerCase());
}
export function nextLegacyStatus(current:string|null,hasAssignee:boolean):string|null{
  if(hasAssignee && (!current || ["","unassigned"].includes(current.trim().toLowerCase())))return "Assigned";
  if(!hasAssignee && current?.trim().toLowerCase()==="assigned")return "Unassigned";
  return current;
}
export function mustBlockLegacyHighRisk(priority:string|null):boolean{
  return priority==="high"||priority==="critical";
}
