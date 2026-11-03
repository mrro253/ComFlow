export interface CoverageAssumption {status:"Active";basis:"commission_reported";statementMonth:string}
/** User rule: Paid supports assumed Active, never carrier-verified coverage or inferred Inactive. */
export function paidCoverageAssumption(commission:{label:string;paidCents:number;evidence:{amountCents:number;chargeback:boolean;category:string;statementMonth:string}[]}):CoverageAssumption|null{
  if(commission.label!=="Paid"||!Number.isSafeInteger(commission.paidCents)||commission.paidCents<=0)return null;
  const months=commission.evidence.filter(e=>!e.chargeback&&e.amountCents>0&&["COMMISSION","INITIAL","RENEWAL"].includes(e.category)&&/^\d{4}-(0[1-9]|1[0-2])$/.test(e.statementMonth)).map(e=>e.statementMonth).sort();
  return months.length?{status:"Active",basis:"commission_reported",statementMonth:months[months.length-1]}:null;
}
