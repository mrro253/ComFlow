import {describe,it,expect} from "vitest";
import {readUhcStatement,UHC_CARRIER} from "../uhc/parseUhcStatement";
import {uhcFixture,uhcText,uhcFixturePdf} from "./fixtures/uhcStatement";
import {extractStatementPdf} from "@/lib/pdf/extractStatementPdf";
import {planStatementImport} from "../planStatementImport";
const hash="a".repeat(64);
describe("UHC renewal statement import",()=>{
  it("reconciles renewal entries to the detail subtotal and payment summary",()=>{
    const {statement,details}=readUhcStatement(uhcText(),hash);
    expect(statement).toMatchObject({carrier:UHC_CARRIER,statementMonth:"2026-03",transactionTotalCents:5801,statementTotalCents:5801,carriedBalanceCents:0,categoryTotalsCents:{RENEWAL:5801}});
    expect(statement.transactions).toHaveLength(2);expect(statement.transactions[0]).toMatchObject({memberId:"9991001",writingAgent:"EXAMPLE, ALEX",writingAgentVerified:true,writingAgentId:null,effectiveDateIso:"2026-01-01",amountCents:1234});
    expect(details[0].clientName).toBe("SYNTHETIC CLIENT 1");expect(details[0].fields.find(f=>f.label==="Product")?.value).toBe("TEST");
  });
  it("extracts and parses a real synthetic PDF through the production transport",async()=>{
    const pdf=await extractStatementPdf(uhcFixturePdf(),UHC_CARRIER);
    expect(pdf.pages).toBe(2);expect(readUhcStatement(pdf.text,pdf.sha256).statement.transactionTotalCents).toBe(5801);
  });
  it("reads right-aligned summary amounts as cells rather than fixed text origins",()=>{
    const pages=uhcFixture();for(const c of pages[1])if(c.row===153&&[389,499].includes(c.column))c.column-=6;
    expect(readUhcStatement(uhcText(pages),hash).statement.statementTotalCents).toBe(5801);
  });
  it.each([
    [0,284,1410,"$12.35"],[1,153,499,"$58.02"],[1,153,389,"$58.02"],[0,324,1410,"$58.02"],
    [1,153,281,"$1.00"],[1,153,611,"$1.00"],[1,153,721,"$1.00"],[1,153,831,"$1.00"],[1,153,941,"$1.00"],
    [0,284,1210,"$1.00"],[0,284,1310,"$1.00"],[0,284,820,"Initial"],[0,284,1410,"-$12.34"],
    [0,284,620,"02/30/2026"],[1,153,19,"04/19/2026"],[1,49,100,"9999999"],
    [0,234,320,"Other identifier"],[0,264,110,"Payee EXAMPLE, ALEX"],
  ] as const)("holds unsupported or inconsistent cell %s/%s/%s",(p,row,col,value)=>{
    const pages=uhcFixture();pages[p].find(c=>c.row===row&&c.column===col)!.text=value;
    expect(()=>readUhcStatement(uhcText(pages),hash)).toThrow();
  });
  it("rejects missing policy IDs and unknown extra financial cells",()=>{
    const pages=uhcFixture();pages[0]=pages[0].filter(c=>!(c.row===284&&c.column===320));expect(()=>readUhcStatement(uhcText(pages),hash)).toThrow();
    const extra=uhcFixture();extra[0].push({row:284,column:1010,text:"$20.00"});expect(()=>readUhcStatement(uhcText(extra),hash)).toThrow();
    const summary=uhcFixture();summary[1].push({row:173,column:499,text:"$20.00"});expect(()=>readUhcStatement(uhcText(summary),hash)).toThrow();
  });
  it("rejects additional pages, writers, reissue payments and comp types",()=>{
    const pages=uhcFixture();pages.push(pages[0]);expect(()=>readUhcStatement(uhcText(pages),hash)).toThrow();
    for(const cell of [{p:0,row:270,column:20,text:"Agent Writing"},{p:1,row:153,column:1023,text:"Yes"},{p:0,row:284,column:520,text:"Override"}]){
      const p=uhcFixture();p[cell.p].push(cell);expect(()=>readUhcStatement(uhcText(p),hash)).toThrow();
    }
  });
  it("uses source identity and occurrence without collapsing legitimate identical rows",()=>{
    const pages=uhcFixture();const first=pages[0].filter(c=>c.row===284);pages[0]=pages[0].filter(c=>c.row!==304);pages[0].push(...first.map(c=>({...c,row:304})));
    for(const page of pages)for(const c of page)if(c.text==="$58.01")c.text="$24.68";
    const a=readUhcStatement(uhcText(pages),hash).statement,b=readUhcStatement(uhcText(pages),"b".repeat(64)).statement;
    expect(a.transactions.map(t=>t.occurrence)).toEqual([1,2]);expect(new Set(a.transactions.map(t=>t.transactionKey)).size).toBe(2);
    expect(a.transactions[0].transactionKey).not.toBe(b.transactions[0].transactionKey);
    expect(planStatementImport([a],[])[0].rows.every(r=>r.disposition==="new")).toBe(true);
    const existing=a.transactions.map((t,i)=>({...t,id:`existing-${i}`}));
    expect(planStatementImport([a],existing)[0].rows.every(r=>r.disposition==="already-imported")).toBe(true);
  });
  it("rejects malformed snapshots and missing source hashes",()=>{
    for(const text of ["not json",JSON.stringify({format:"wrong",pages:uhcFixture()})])expect(()=>readUhcStatement(text,hash)).toThrow();
    expect(()=>readUhcStatement(uhcText(),"missing")).toThrow();
  });
});
