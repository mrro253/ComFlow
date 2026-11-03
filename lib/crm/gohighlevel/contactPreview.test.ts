import { afterEach,expect,it,vi } from "vitest";
import { compareContactCandidates,fullMbi,readMbiField,searchAssignedContacts } from "./contactPreview";
const sale={code:"APP1",firstName:"Test",lastName:"Person",mbi:"1AB2CD3EF45",carrier:"Synthetic",plan:"Synthetic",proposedEffectiveDate:"2026-01-01"};
const contact={id:"Contact123",firstName:"TEST",lastName:" Person ",mbi:sale.mbi};
const token="synthetic-private-token-for-test";
afterEach(()=>vi.unstubAllGlobals());
function reply(value:unknown){return new Response(JSON.stringify(value),{status:200});}
it("does not match partial identifiers or merge separate applications",()=>{
 expect(fullMbi("***EF45")).toBeNull();expect(fullMbi("1ab2-cd3 ef45")).toBe(sale.mbi);
 expect(compareContactCandidates(sale,[contact],true).status).toBe("MBI agreement");
 expect(compareContactCandidates({...sale,code:"APP2"},[contact],true).code).toBe("APP2");
 expect(compareContactCandidates(sale,[{...contact,mbi:null}],true).status).toBe("Name candidate");
 expect(compareContactCandidates(sale,[{...contact,mbi:"9AB2CD3EF45"}],true).status).toBe("Identity conflict");
 expect(compareContactCandidates(sale,[contact,{...contact,id:"Contact456"}],true).status).toBe("Multiple candidates");
 expect(compareContactCandidates(sale,[],false).status).toBe("Search incomplete");
 expect(compareContactCandidates(sale,[],true).status).toBe("No candidate found");
});
it("filters wrong users and locations before returning candidates and never returns raw identifiers",async()=>{
 const f=vi.fn().mockResolvedValue(reply({contacts:[{...contact,locationId:"Location123",assignedTo:"OtherUser123"},{...contact,locationId:"OtherLocation123",assignedTo:"GhlUser123"},{...contact,locationId:"Location123",assignedTo:"GhlUser123",customFields:[{id:"Field123",value:sale.mbi}],ss:"excluded"}]}));vi.stubGlobal("fetch",f);
 const result=await searchAssignedContacts("Location123","GhlUser123",token,sale,"Field123");expect(result.contacts).toHaveLength(1);
 const rows=compareContactCandidates(sale,result.contacts,result.complete);expect(JSON.stringify(rows)).not.toContain(sale.mbi);expect(JSON.stringify(rows)).not.toContain(token);expect(JSON.stringify(rows)).not.toContain("Contact123");
 expect(f.mock.calls[0][0]).toContain("https://services.leadconnectorhq.com/contacts/?locationId=Location123");expect(f.mock.calls[0][1]).toMatchObject({method:"GET",redirect:"error",cache:"no-store"});
});
it("does not silently call a full page complete or hide provider failures",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(reply({contacts:Array.from({length:100},()=>({locationId:"OtherLocation"}))})));
 expect((await searchAssignedContacts("Location123","GhlUser123",token,sale,null)).complete).toBe(false);
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("private provider body",{status:403})));
 await expect(searchAssignedContacts("Location123","GhlUser123",token,sale,null)).rejects.toThrow("GHL read unavailable");
});
it("resolves only one exact MBI field key in the verified location",async()=>{
 const field={id:"Field123",fieldKey:"contact.medicare_number_mbi",locationId:"Location123",model:"contact"};
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(reply({customFields:[field,{...field,id:"Member123",fieldKey:"contact.member_id"}]})));
 expect(await readMbiField("Location123",token)).toBe("Field123");
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(reply({customFields:[field,{...field,id:"Duplicate123"}]})));
 expect(await readMbiField("Location123",token)).toBeNull();
});
