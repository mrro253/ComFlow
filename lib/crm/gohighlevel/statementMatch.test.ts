import { expect,it } from "vitest";
import { matchStatementContact,statementNames } from "./statementMatch";
import type { CommissionEvidence } from "@/lib/enrollments/commissionMatches";
const e={carrier:"Ultimate Health Plans",firstName:"Example",lastName:"Person",clientName:"Example Person",medicareId:"5MK73",effectiveDate:"2026-03-01"} as CommissionEvidence;
const c={id:"Contact123",firstName:"Example",lastName:"Person",mbi:"1EG4TE5MK73"};
const p={...c,values:{DateField123:"2026-03-01"}};
const fields=[{id:"DateField123",key:"contact.date",name:"Medicare Policy Effective Date",type:"DATE",options:[]}];
it("requires exact name, five-character Ultimate suffix and policy date for a partial-ID match",()=>{
 expect(matchStatementContact(e,c,p,fields)).toMatchObject({verified:true,partial:true,date:true});
 expect(matchStatementContact(e,c,{...p,values:{DateField123:"2025-01-01"}},fields).verified).toBe(false);
 expect(matchStatementContact({...e,carrier:"UnitedHealthcare"},c,p,fields).verified).toBe(false);
 expect(matchStatementContact({...e,medicareId:"UL1234567"},c,p,fields).verified).toBe(false);
 expect(matchStatementContact(e,{...c,lastName:"Different"},p,fields).verified).toBe(false);
 expect(matchStatementContact(e,c,p,[...fields,fields[0]]).verified).toBe(false);
});
it("distinguishes full-MBI identity from policy-date agreement",()=>{
 expect(matchStatementContact({...e,medicareId:c.mbi},c,{...p,values:{}},fields)).toMatchObject({verified:true,full:true,date:false});
 expect(matchStatementContact({...e,medicareId:"9AB2CD3EF45"},c,p,fields).verified).toBe(false);
});
it("handles original statement names without exchanging their order",()=>{
 expect(statementNames({...e,firstName:"",lastName:"",clientName:"Person, Example"})).toEqual({firstName:"Example",lastName:"Person"});
});
