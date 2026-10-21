import { sha256 } from "@/lib/carriers/digest";
import { parseMoneyToCents } from "@/lib/carriers/money";
import type { ParsedStatement, ParsedTransaction, StatementParser } from "@/lib/carriers/types";
import type { StatementRowDetails } from "@/lib/carriers/ultimate/statementDetails";

export const UHC_CARRIER = "UnitedHealthcare";
export interface UhcCell { text: string; row: number; column: number }
export type UhcPage = UhcCell[];
const near = (a: number, b: number) => Math.abs(a - b) < 1;
const fail = () => { throw new Error("Unsupported UnitedHealthcare statement layout or unreconciled totals"); };
const money = (value: string) => parseMoneyToCents(value.replace(/^\$/, ""));
function date(value: string) {
  const m = /^(\d{2})\/(\d{2})\/(20\d{2})$/.exec(value);
  if (!m) return fail();
  const iso = `${m[3]}-${m[1]}-${m[2]}`;
  if (new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) return fail();
  return iso;
}
function unique(items: UhcPage, predicate: (cell: UhcCell) => boolean) {
  const found = items.filter(predicate);
  if (found.length !== 1) return fail();
  return found[0];
}
function at(page: UhcPage, row: number, column: number, optional = false) {
  const cells = page.filter((cell) => near(cell.row, row) && near(cell.column, column));
  if (cells.length > 1 || (!optional && cells.length !== 1)) return fail();
  return cells[0]?.text ?? "";
}
function snapshot(text: string): UhcPage[] {
  let data;
  try { data = JSON.parse(text); } catch { return fail(); }
  if (data?.format !== "uhc-rotated-v1" || !Array.isArray(data.pages) || data.pages.length !== 2) return fail();
  for (const page of data.pages) {
    if (!Array.isArray(page) || !page.length || page.length > 10000) return fail();
    for (const c of page) if (typeof c?.text !== "string" || !Number.isFinite(c.row) || !Number.isFinite(c.column)) return fail();
  }
  return data.pages;
}

/** Initial verified scope: one writer, one detail page, renewal rows and a zero-balance summary. */
export function readUhcStatement(text: string, sourceHash: string): { statement: ParsedStatement; details: StatementRowDetails[] } {
  if (!/^[a-f0-9]{64}$/.test(sourceHash)) return fail();
  const [page, summary] = snapshot(text);
  const headings: [string, number][] = [["Member Name",20],["Policy Number",320],["Comp Type",520],
    ["Member State",720],["Product",420],["Commission Action",820],["Payment Period",1120],["Prem Amount",1210],["UAD Activity",1310],["Commission",1410]];
  const heading = unique(page, c => c.text === "Member Name");
  for (const [label, column] of headings) if (at(page, heading.row, column) !== label) return fail();
  if (!page.some(c => c.text.includes("Medicare Plan Commission")) || !summary.some(c => c.text === "Summary")) return fail();
  const party=(p:UhcPage)=>{const h=unique(p,c=>c.text==="Party ID");const value=at(p,h.row,100);if(!/^\d+$/.test(value))return fail();return value;};
  if(party(page)!==party(summary)) return fail();
  const writerLabel = unique(page, c => c.text === "Agent Writing" && near(c.column,20));
  const writer = /^(\d+) - (.+) - Statement Date (\d{2}\/\d{2}\/20\d{2})$/.exec(at(page,writerLabel.row,110));
  if (!writer || !/^[A-Za-z][A-Za-z ,.'-]+$/.test(writer[2])) return fail();
  const statementDate = writer[3], statementMonth = date(statementDate).slice(0,7);
  const summaryHeading = unique(summary,c=>c.text==="Statement Date");
  const summaryRows = summary.filter(c=>near(c.column,19) && c.row>summaryHeading.row && /^\d{2}\//.test(c.text));
  if (summaryRows.length!==1 || summaryRows[0].text!==statementDate) return fail();
  const sy=summaryRows[0].row;
  if(summary.some(c=>c.row>summaryHeading.row && !near(c.row,sy))) return fail();
  const paymentNumber=unique(summary,c=>c.text==="Payment Number");
  const paymentId=at(summary,sy,paymentNumber.column);
  if(!/^\d+$/.test(paymentId)) return fail();
  const summaryValue = (label:string) => {
    const h=unique(summary,c=>c.text===label);
    const cells=summary.filter(c=>near(c.row,sy) && c.column>=h.column-1 && c.column<h.column+100);
    if(cells.length!==1) return fail();
    return cells[0].text;
  };
  const summaryMoney = (label:string) => money(summaryValue(label));
  for(const label of ["Prior Balance","Ending Balance","Prior UAD Balance","UAD Activity","Ending UAD Balance"]) if(summaryMoney(label)!==0) return fail();
  const reissue=unique(summary,c=>c.text==="Payment Reissue");
  if(summary.some(c=>near(c.row,sy)&&c.column>=reissue.column)) return fail();
  const activity=summaryMoney("Commission Activity"), payment=summaryMoney("Payment Amount");
  const footer=unique(page,c=>c.row>writerLabel.row && near(c.column,820) && c.text.includes("Statement Date"));
  if(!footer.text.endsWith(statementDate) || money(at(page,footer.row,1410))!==activity ||
     money(at(page,footer.row,1210))!==0 || money(at(page,footer.row,1310))!==0) return fail();
  const rowPositions=[...new Set(page.filter(c=>c.row>writerLabel.row && c.row<footer.row).map(c=>c.row))].sort((a,b)=>a-b);
  if(!rowPositions.length) return fail();
  const occurrences=new Map<string,number>(), transactions:ParsedTransaction[]=[], details:StatementRowDetails[]=[];
  for(const row of rowPositions) {
    const name=at(page,row,20), memberId=at(page,row,320), effectiveDate=at(page,row,620);
    const category=at(page,row,820), amountCents=money(at(page,row,1410));
    if(!name || !/^\d+$/.test(memberId) || category!=="Renewal" || amountCents<=0 ||
       at(page,row,520,true)!=="" || money(at(page,row,1210))!==0 || money(at(page,row,1310))!==0) return fail();
    const allowed=[20,220,320,420,520,620,720,820,1120,1210,1310,1410];
    if(page.some(c=>near(c.row,row)&&!allowed.some(col=>near(c.column,col)))) return fail();
    const effectiveDateIso=date(effectiveDate), type="RENEWAL";
    const fingerprint=JSON.stringify([memberId,effectiveDate,type,amountCents]);
    const occurrence=(occurrences.get(fingerprint)??0)+1;occurrences.set(fingerprint,occurrence);
    transactions.push({carrier:UHC_CARRIER,statementMonth,memberId,effectiveDate,effectiveDateIso,type,amountCents,
      writingAgent:writer[2],writingAgentVerified:true,writingAgentId:null,sourceHash,sourceRow:transactions.length+1,occurrence,
      transactionKey:sha256(JSON.stringify(["uhc-v1",sourceHash,fingerprint,occurrence]))});
    const columns:[string,number][]=[["Client name",20],["Medicare / AARP member / exchange ID",220],["Policy number",320],["Product",420],["Comp type",520],
      ["Original effective date",620],["Member state",720],["Commission action",820],["Payment period",1120],["Premium amount",1210],["UAD activity",1310],["Commission",1410]];
    details.push({clientName:name,memberId,effectiveDate,writingAgent:writer[2],amountCents,category:type,
      fields:[...columns.map(([label,col])=>({label,value:at(page,row,col,true)})),{label:"Writing agent",value:writer[2]},
        {label:"Writing agent ID",value:writer[1]},{label:"Statement date",value:statementDate},
        {label:"Payment number",value:paymentId},{label:"Statement commission activity",value:summaryValue("Commission Activity")},
        {label:"Statement payment amount",value:summaryValue("Payment Amount")}]});
  }
  const total=transactions.reduce((sum,tx)=>sum+tx.amountCents,0);
  if(!Number.isSafeInteger(total)||total!==activity||activity!==payment) return fail();
  return {statement:{carrier:UHC_CARRIER,statementMonth,sourceHash,transactions,categoryTotalsCents:{RENEWAL:total},
    transactionTotalCents:total,carriedBalanceCents:0,statementTotalCents:payment},details};
}
export const uhcParser:StatementParser={carrier:UHC_CARRIER,parse:(text,hash)=>readUhcStatement(text,hash).statement};
