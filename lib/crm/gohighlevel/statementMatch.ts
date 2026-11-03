import { fullMbi,type PreviewContact } from "./contactPreview";
import type { PolicyContact,PolicyField } from "./policyUpdatePreview";
import type { CommissionEvidence } from "@/lib/enrollments/commissionMatches";
export const statementName=(s:string)=>s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]/g,"");
export function statementNames(e:CommissionEvidence){
 if(e.firstName&&e.lastName)return {firstName:e.firstName,lastName:e.lastName};
 const parts=e.clientName.split(",");if(parts.length===2)return {firstName:parts[1].trim(),lastName:parts[0].trim()};
 const words=e.clientName.trim().split(/\s+/);return {firstName:words.slice(0,-1).join(" "),lastName:words.at(-1)??""};
}
export function matchStatementContact(e:CommissionEvidence,c:PreviewContact,policy:PolicyContact,fields:PolicyField[]){
 const names=statementNames(e),name=statementName(names.firstName+names.lastName)===statementName(c.firstName+c.lastName);
 const id=e.medicareId.replace(/[ -]/g,"").toUpperCase(),mbi=fullMbi(policy.mbi);
 const full=!!mbi&&fullMbi(id)===mbi;
 const partial=e.carrier==="Ultimate Health Plans"&&/^[A-Z0-9]{5}$/.test(id)&&!!mbi&&mbi.endsWith(id);
 const dates=fields.filter(f=>f.name==="Medicare Policy Effective Date"&&f.type==="DATE"),raw=dates.length===1?policy.values[dates[0].id]:null;
 const date=typeof raw==="string"&&/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(raw)&&raw.slice(0,10)===e.effectiveDate;
 return {verified:name&&(full||partial&&date),full,partial,name,date,currentDate:typeof raw==="string"?raw.slice(0,10):"Not listed",basis:full?"Full MBI and name agree":partial&&name&&date?"Name, partial MBI and effective date agree":"Identity not verified"};
}
