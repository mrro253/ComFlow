import { expect,it,vi } from "vitest";
import { processGhlImportJobs } from "../ghlImportJobs";
const m=vi.hoisted(()=>({process:vi.fn()}));vi.mock("../../../lib/automation/runGhlImportJob",()=>({processGhlImportJob:m.process}));
it("processes only due queued/expired jobs without opening a carrier portal",async()=>{
 const filters:string[]=[];const q={select:()=>q,in:(key:string)=>{filters.push(key);return q;},lte:()=>q,or:()=>q,order:()=>q,limit:async()=>({data:[{id:"job"}],error:null})};m.process.mockResolvedValue(true);expect(await processGhlImportJobs({from:()=>q} as never)).toBe(1);expect(m.process).toHaveBeenCalledWith("job");expect(filters).toEqual(["state"]);
});
