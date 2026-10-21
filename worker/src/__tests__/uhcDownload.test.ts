import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { Page } from "playwright";
import { downloadUhcMonth, downloadUhcYear } from "../carriers/uhcDownload";
import { UHC_STATEMENTS_URL, UHC_TEXT_HEADER } from "../carriers/uhcMetadata";
const roots: string[] = [];
async function directory() { const root = await mkdtemp(path.join(os.tmpdir(),"comflow-uhc-test-")); roots.push(root); return root; }
afterEach(async () => { for(const root of roots.splice(0)) { if(path.dirname(root)!==path.resolve(os.tmpdir()) || !path.basename(root).startsWith("comflow-uhc-test-")) throw new Error("Unsafe test cleanup"); await rm(root,{recursive:true,force:true}); } });
async function fixture(options: { months?: string[]; party?: string; invalidText?: boolean; mismatch?: boolean; wrongHost?: boolean; header?: string; failedMonth?: string } = {}) {
  const root = await directory(), pdf = path.join(root,"source.pdf"), text = path.join(root,"source.txt");
  await writeFile(pdf,"%PDF-synthetic"); await writeFile(text, options.invalidText ? "<html>Error</html>" : UHC_TEXT_HEADER.join(",")+"\n");
  const names = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const menus: Record<string,string[]> = {Year:["2026","2025"],Month:options.months ?? ["JANUARY","FEBRUARY"],Format:["EXCEL","PDF","TEXT"]};
  const selected: Record<string,string> = {Year:"2026",Month:menus.Month[0],Format:"PDF"};
  let opened="", cursor=0; const downloads: string[]=[];
  const combo = (name:string) => ({innerText:async()=>selected[name],press:async(key:string)=>{if(key==="Home")cursor=0;else if(key==="ArrowDown")cursor++;else if(key==="Enter"){selected[name]=menus[name][cursor];opened="";}else if(key==="Escape")opened="";}});
  const page = {
    url:()=>options.wrongHost ? "https://example.invalid/" : UHC_STATEMENTS_URL,
    getByText:()=>({first:()=>({innerText:async()=>options.header ?? `You are now accessing JARVIS as Medicare User: SYNTHETIC ( PID: ${options.party ?? "999001"} )`})}),
    locator:()=>({allTextContents:async()=>menus[opened]}),
    getByRole:(role:string,opts:{name:string})=>role==="combobox" ? combo(opts.name) : {click:async()=>{if(opts.name!=="DOWNLOAD"){opened=opts.name;cursor=menus[opts.name].indexOf(selected[opts.name]);}else downloads.push(`${selected.Year}-${names.indexOf(selected.Month)+1}:${selected.Format}`);}},
    waitForEvent:async()=>{
      const kind = selected.Format==="PDF" ? "pdf" : "txt", month=`${selected.Year}-${String(names.indexOf(selected.Month)+1).padStart(2,"0")}`;
      return {url:()=>"blob:https://www.uhcjarvis.com/synthetic",failure:async()=>options.failedMonth===month ? "synthetic failure" : null,
        suggestedFilename:()=>`commission_statement_${options.mismatch && kind==="txt" ? "999002" : options.party ?? "999001"}_${month}-01.${kind}`,
        path:async()=>kind==="pdf" ? pdf : text};
    },
  } as unknown as Page;
  return {page,downloads};
}
describe("UnitedHealthcare paired downloads",()=>{
  it("accepts a payee header containing a separate writing ID",async()=>{ const root=await directory(),f=await fixture({header:"You are now accessing JARVIS (PID: 999001, WID: 999777)"}); expect((await downloadUhcMonth(f.page,"2026-01",root)).statementMonth).toBe("2026-01"); });
  it.each(["You are now accessing JARVIS (WID: 999777)","You are now accessing JARVIS PID: 999001 PID: 999002"])("rejects missing or ambiguous payee proof",async(header)=>{ const root=await directory(),f=await fixture({header}); await expect(downloadUhcMonth(f.page,"2026-01",root)).rejects.toThrow("payee"); expect(f.downloads).toEqual([]); });
  it("preserves both sources and an idempotent content-hash manifest",async()=>{
    const root=await directory(),f=await fixture();const pair=await downloadUhcMonth(f.page,"2026-02",root);
    expect(pair.statementMonth).toBe("2026-02");expect(pair.payeeHash).toMatch(/^[a-f0-9]{64}$/);expect(f.downloads).toEqual(["2026-2:PDF","2026-2:TEXT"]);
    await downloadUhcMonth(f.page,"2026-02",root);expect(await readdir(root)).toHaveLength(3);
  });
  it("blocks unavailable months before downloading",async()=>{
    const root=await directory(),f=await fixture();await expect(downloadUhcMonth(f.page,"2026-12",root)).rejects.toThrow("unavailable");expect(f.downloads).toEqual([]);
  });
  it.each([{invalidText:true},{mismatch:true},{wrongHost:true}])("never records a pair for invalid content/account/page %s",async(options)=>{
    const root=await directory(),f=await fixture(options);await expect(downloadUhcMonth(f.page,"2026-01",root)).rejects.toThrow();expect(await readdir(root)).toEqual([]);
  });
  it("does not overwrite a conflicting stored source",async()=>{
    const root=await directory(),f=await fixture();const pair=await downloadUhcMonth(f.page,"2026-01",root);
    await writeFile(path.join(root,pair.pdf.file),"synthetic changed");await expect(downloadUhcMonth(f.page,"2026-01",root)).rejects.toThrow("integrity");
    expect(await readFile(path.join(root,pair.pdf.file),"utf8")).toBe("synthetic changed");
  });
});
describe("UnitedHealthcare year scope and explicit resume",()=>{
  it("discovers available months without guessing missing future months",async()=>{
    const root=await directory(),f=await fixture();const result=await downloadUhcYear(f.page,2026,root);
    expect(result).toMatchObject({available:2,saved:["2026-01","2026-02"],reused:[],failed:[]});expect(f.downloads).toHaveLength(4);
  });
  it("reuses only verified matching-account pairs when explicitly resuming",async()=>{
    const root=await directory(),first=await fixture();await downloadUhcMonth(first.page,"2026-01",root);
    const resumed=await fixture();const result=await downloadUhcYear(resumed.page,2026,root,true);
    expect(result.reused).toEqual(["2026-01"]);expect(resumed.downloads).toEqual(["2026-2:PDF","2026-2:TEXT"]);
    const other=await fixture({party:"999003"});expect((await downloadUhcYear(other.page,2026,root,true)).reused).toEqual([]);
  });
  it("leaves corrupt cached evidence untouched and reports the month failed",async()=>{
    const root=await directory(),f=await fixture({months:["JANUARY"]});const pair=await downloadUhcMonth(f.page,"2026-01",root);
    await writeFile(path.join(root,pair.text.file),"changed");const result=await downloadUhcYear(f.page,2026,root,true);
    expect(result.failed).toEqual(["2026-01"]);expect(result.saved).toEqual([]);expect(await readFile(path.join(root,pair.text.file),"utf8")).toBe("changed");
  });
  it("keeps completed months when a later download fails",async()=>{
    const root=await directory(),f=await fixture({failedMonth:"2026-02"});const result=await downloadUhcYear(f.page,2026,root);
    expect(result.saved).toEqual(["2026-01"]);expect(result.failed).toEqual(["2026-02"]);expect(await readdir(root)).toHaveLength(3);
  });
  it("does not let an unrelated legacy manifest block resume",async()=>{
    const root=await directory(),f=await fixture({months:["JANUARY"]});await writeFile(path.join(root,"a".repeat(64)+".json"),JSON.stringify({carrier:"UnitedHealthcare",statementMonth:"2026-09"}));
    expect((await downloadUhcYear(f.page,2026,root,true)).saved).toEqual(["2026-01"]);
  });
});
