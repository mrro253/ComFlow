import { beforeEach,expect,it,vi } from "vitest";
import { previewGhlContacts,linkGhlContacts } from "./actions";
const m=vi.hoisted(()=>({user:vi.fn(),access:vi.fn(),sales:vi.fn(),verify:vi.fn(),field:vi.fn(),search:vi.fn(),saved:vi.fn(),append:vi.fn()}));
vi.mock("@/lib/repositories/ghlLinkRepository",()=>({savedGhlLinks:m.saved,appendGhlLinks:m.append}));
vi.mock("@/lib/auth/requireRole",()=>({requireRole:m.user}));
vi.mock("@/lib/repositories/ghlPreviewRepository",()=>({ghlPreviewAccess:m.access}));
vi.mock("@/lib/services/saleDispositionService",()=>({listEditableSales:m.sales}));
vi.mock("@/lib/crm/gohighlevel/setupClient",()=>({verifyGhlUser:m.verify,validateSetupInput:vi.fn(),validGhlId:vi.fn()}));
vi.mock("@/lib/crm/gohighlevel/contactPreview",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/crm/gohighlevel/contactPreview")>(),readMbiField:m.field,searchAssignedContacts:m.search}));
const access={connectionId:"Connection123",locationId:"Location123",ghlUserId:"User123",token:"private-synthetic-token"};
beforeEach(()=>{vi.resetAllMocks();m.saved.mockResolvedValue([]);m.append.mockResolvedValue(1);m.user.mockResolvedValue({id:"actor",agencyId:"agency",role:"agent",active:true});m.access.mockResolvedValue(access);m.verify.mockResolvedValue(undefined);m.sales.mockResolvedValue([{ownerId:"owner",collectionHash:"a".repeat(64),code:"APP1",source:{code:"APP1",firstName:"Test",lastName:"Person",mbi:"1AB2CD3EF45",carrier:"Synthetic",plan:"Synthetic",proposedEffectiveDate:"2026-01-01"}}]);m.field.mockResolvedValue(null);m.search.mockResolvedValue({contacts:[],complete:true});});
it("requires verified self assignment before reading contacts",async()=>{
 m.access.mockRejectedValueOnce(new Error("denied"));expect((await previewGhlContacts()).error).toBeDefined();expect(m.search).not.toHaveBeenCalled();
});
it("rejects a stale review and never links from client-supplied identity data",async()=>{
 await linkGhlContacts("a".repeat(64));expect(m.append).not.toHaveBeenCalled();
});
it("rechecks full-MBI evidence and saves only the reviewed unique identity",async()=>{
 m.field.mockResolvedValue("Field123");m.search.mockResolvedValue({contacts:[{id:"Contact123",firstName:"Test",lastName:"Person",mbi:"1AB2CD3EF45"}],complete:true});
 const preview=await previewGhlContacts(true);expect(preview.linkable).toBe(1);expect(preview.reviewHash).toMatch(/^[a-f0-9]{64}$/);
 const result=await linkGhlContacts(preview.reviewHash!);expect(result.rows?.[0].linked).toBe(true);expect(m.append).toHaveBeenCalledWith(expect.anything(),access,[expect.objectContaining({contactId:"Contact123",code:"APP1"})]);expect(JSON.stringify(result)).not.toContain("Contact123");
});
it("does not return partial results after remote failure or removed access",async()=>{
 m.search.mockRejectedValueOnce(new Error("private body"));expect(await previewGhlContacts()).not.toHaveProperty("rows");
 m.access.mockResolvedValueOnce(access).mockRejectedValueOnce(new Error("removed"));expect(await previewGhlContacts()).not.toHaveProperty("rows");
});
it("rechecks credentials and assignment before returning a preview",async()=>{
 m.access.mockResolvedValueOnce(access).mockResolvedValueOnce({...access,ghlUserId:"ChangedUser"});expect(await previewGhlContacts()).not.toHaveProperty("rows");
});
it("returns only a sanitized preview without persistence",async()=>{
 const result=await previewGhlContacts();expect(result.rows).toHaveLength(1);expect(result.warning).toContain("not confirmed");expect(JSON.stringify(result)).not.toContain(access.token);expect(JSON.stringify(result)).not.toContain("1AB2CD3EF45");expect(m.verify).toHaveBeenCalledWith(access.locationId,access.ghlUserId,access.token);
});
it("broadens only unmatched enrollments and compares full MBIs without returning them",async()=>{
 m.field.mockResolvedValue("Field123");m.search.mockResolvedValueOnce({contacts:[],complete:true}).mockResolvedValue({contacts:[{id:"Contact123",firstName:"Alternate",lastName:"Person",mbi:"1AB2CD3EF45"}],complete:true});
 const result=await previewGhlContacts(true);expect(result.rows?.[0].status).toBe("Name differs");expect(result.investigated).toBe(true);expect(m.search).toHaveBeenCalledTimes(3);expect(JSON.stringify(result)).not.toContain("1AB2CD3EF45");
});
