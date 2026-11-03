import { beforeEach,expect,it,vi } from "vitest";
import { appendGhlLinks } from "../ghlLinkRepository";
const m=vi.hoisted(()=>({access:vi.fn(),admin:vi.fn(),source:vi.fn(),read:vi.fn(),insert:vi.fn()}));
vi.mock("../ghlPreviewRepository",()=>({ghlPreviewAccess:m.access}));
vi.mock("../saleDispositionRepository",()=>({readAuthorizedSaleSource:m.source}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:m.admin}));
const access={connectionId:"Connection123",locationId:"Location123",locationName:"Synthetic location",ghlUserId:"User123",token:"synthetic-token"};
const user={id:"actor",agencyId:"agency",active:true,role:"agent"} as Parameters<typeof appendGhlLinks>[0];
const link={ownerId:"owner",collectionHash:"a".repeat(64),code:"APP1",contactId:"Contact123",nameDiffers:false};
const details={version:1,...link,locationId:access.locationId,ghlUserId:access.ghlUserId};
beforeEach(()=>{vi.resetAllMocks();m.access.mockResolvedValue(access);m.source.mockResolvedValue({});m.read.mockResolvedValue({data:null,error:null});m.insert.mockResolvedValue({error:null});const q={select:vi.fn(),eq:vi.fn(),maybeSingle:m.read,insert:m.insert};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);m.admin.mockReturnValue({from:()=>q});});
it("saves an append-only ComFlow link and skips an identical retry",async()=>{
 expect(await appendGhlLinks(user,access,[link])).toBe(1);expect(m.source).toHaveBeenCalledWith(user,link.ownerId,link.collectionHash,link.code);
 expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({action:"ghl.enrollment_link_confirmed",details:expect.objectContaining({contactId:link.contactId})}));
 m.read.mockResolvedValue({data:{details},error:null});expect(await appendGhlLinks(user,access,[link])).toBe(0);expect(m.insert).toHaveBeenCalledTimes(1);
});
it("refuses removed enrollment access, changed mappings and replacement identities",async()=>{
 m.source.mockRejectedValueOnce(new Error("removed"));await expect(appendGhlLinks(user,access,[link])).rejects.toThrow();expect(m.insert).not.toHaveBeenCalled();
 m.access.mockResolvedValueOnce({...access,ghlUserId:"OtherUser"});await expect(appendGhlLinks(user,access,[link])).rejects.toThrow();
 m.read.mockResolvedValue({data:{details:{...details,contactId:"OtherContact"}},error:null});await expect(appendGhlLinks(user,access,[link])).rejects.toThrow();expect(m.insert).not.toHaveBeenCalled();
});
it("handles a concurrent identical insert but rejects a concurrent conflicting identity",async()=>{
 m.read.mockResolvedValueOnce({data:null,error:null}).mockResolvedValueOnce({data:{details},error:null});m.insert.mockResolvedValue({error:{code:"23505"}});expect(await appendGhlLinks(user,access,[link])).toBe(0);
 m.read.mockResolvedValueOnce({data:null,error:null}).mockResolvedValueOnce({data:{details:{...details,contactId:"OtherContact"}},error:null});await expect(appendGhlLinks(user,access,[link])).rejects.toThrow();
});
