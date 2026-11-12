export type QaVerdict="passed"|"needs_correction";
export function canQualityReview(reviewerId:number,assignedUserId:number|null,completed:boolean):boolean{
 return completed && Number.isInteger(reviewerId) && reviewerId>0 &&
 assignedUserId!==null && assignedUserId!==reviewerId;
}
export function isQaScore(score:number):boolean{
 return Number.isInteger(score) && score>=0 && score<=100;
}
export function taskQaDepartment(bucket:string|null,status:string|null):"Verification"|"Billing"|null{
 if(status==="verified")return "Verification";
 if(bucket==="done" || status==="billed" || status==="done")return "Billing";
 return null;
}
