import { expect,it } from "vitest";
import { paidCoverageAssumption } from "../coverageAssumption";
const evidence={amountCents:10000,chargeback:false,category:"COMMISSION",statementMonth:"2026-01"};
it("assumes Active from the currently Paid enrollment with matching positive commission evidence",()=>{
 expect(paidCoverageAssumption({label:"Paid",paidCents:20000,evidence:[evidence,{...evidence,statementMonth:"2026-03"}]})).toEqual({status:"Active",basis:"commission_reported",statementMonth:"2026-03"});
});
it("does not infer Inactive or override charged-back/no-commission-expected outcomes",()=>{
 for(const label of ["Charged back","No commission expected","Not paid yet"])expect(paidCoverageAssumption({label,paidCents:10000,evidence:[evidence]})).toBeNull();
 expect(paidCoverageAssumption({label:"Paid",paidCents:0,evidence:[evidence]})).toBeNull();
});
it("requires actual positive commission evidence rather than adjustments or an invalid statement date",()=>{
 expect(paidCoverageAssumption({label:"Paid",paidCents:10000,evidence:[{...evidence,category:"ADJUSTMENT"}]})).toBeNull();
 expect(paidCoverageAssumption({label:"Paid",paidCents:10000,evidence:[{...evidence,statementMonth:"2026-99"}]})).toBeNull();
});
