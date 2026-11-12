/**
 * Weighted task completion. Scoring is based on a unique completion event,
 * not all status edits or API loads.
 */
export const DEFAULT_RCM_WEIGHTS: Record<string, number> = {
  Verification: 1,
  Billing: 1.25,
  Posting: 0.75,
  Collections: 1.5,
  Denials: 2,
  Arbitration: 2.5,
  Checks: 0.75,
  "Case Management / RTP": 1.5,
  Closed: 0.75,
};
export type CompletionEvent = {source: string; recordId: number; department: string; employeeId: number; completedAt: string};
export type WeightedSummary = {completions: number; units: number; byDepartment: Record<string, {completions:number;units:number}>};

export function scoreCompletions(events: readonly CompletionEvent[], weights: Readonly<Record<string,number>>): WeightedSummary {
  const seen = new Set<string>();
  const result: WeightedSummary={completions:0,units:0,byDepartment:{}};
  const sorted=events.slice().sort((a,b)=>b.completedAt.localeCompare(a.completedAt));
  for(const event of sorted){
    if(!Number.isInteger(event.recordId)||event.recordId<1||!Number.isInteger(event.employeeId)||event.employeeId<1)continue;
    const key=event.source+":"+event.recordId;
    if(seen.has(key))continue;
    seen.add(key);
    const weight=weights[event.department];
    if(typeof weight!=="number"||!Number.isFinite(weight)||weight<0||weight>100)continue;
    result.completions+=1;
    result.units=Math.round((result.units+weight)*100)/100;
    const previous=result.byDepartment[event.department]||{completions:0,units:0};
    result.byDepartment[event.department]={
      completions:previous.completions+1,
      units:Math.round((previous.units+weight)*100)/100,
    };
  }
  return result;
}
