import { beforeEach,expect,it,vi } from "vitest";
import { previewGhlContacts } from "./actions";
const m=vi.hoisted(()=>({user:vi.fn(),access:vi.fn(),sales:vi.fn(),verify:vi.fn(),field:vi.fn(),search:vi.fn()}));
vi.mock("@/lib/auth/requireRole",()=>({requireRole:m.user}));
vi.mock("@/lib/repositories/ghlPreviewRepository",()=>({ghlPreviewAccess:m.access}));
vi.mock("@/lib/services/saleDispositionService",()=>({listEditableSales:m.sales}));
vi.mock("@/lib/crm/gohighlevel/setupClient",()=>({verifyGhlUser:m.verify,validateSetupInput:vi.fn(),validGhlId:vi.fn()}));
vi.mock("@/lib/crm/gohighlevel/contactPreview",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/crm/gohighlevel/contactPreview")>(),readMbiField:m.field,searchAssignedContacts:m.search}));
const access={connectionId:"Connection123",locationId:"Location123",ghlUserId:"User123",token:"private-synthetic-token"};
beforeEach(()=>{vi.resetAllMocks();m.user.mockResolvedValue({id:"actor",agencyId:"agency",role:"agent",active:true});m.access.mockResolvedValue(access);m.verify.mockResolvedValue(undefined);m.sales.mockResolvedValue([{source:{code:"APP1",firstName:"Test",lastName:"Person",mbi:"1AB2CD3EF45",carrier:"Synthetic",plan:"Synthetic",proposedEffectiveDate:"2026-01-01"}}]);m.field.mockResolvedValue(null);m.search.mockResolvedValue({contacts:[],complete:true});});
it("requires verified self assignment before reading contacts",async()=>{
 m.access.mockRejectedValueOnce(new Error("denied"));expect((await previewGhlContacts()).error).toBeDefined();expect(m.search).not.toHaveBeenCalled();
});
it("does not return partial results after remote failure or removed access",async()=>{
 m.search.mockRejectedValueOnce(new Error("private body"));expect(await previewGhlContacts()).not.toHaveProperty("rows");
 m.access.mockResolvedValueOnce(access).mockRejectedValueOnce(new Error("removed"));expect(await previewGhlContacts()).not.toHaveProperty("rows");
});
it("rechecks credentials and assignment before returning a preview",async()=>{
 m.access.mockResolvedValueOnce(access).mockResolvedValueOnce({...access,ghlUserId:"ChangedUser"});expect(await previewGhlContacts()).not.toHaveProperty("rows");
});
it("returns only a sanitized preview without persistence",async()=>{
 const result=await previewGhlContacts();expect(result.rows).toHaveLength(1);expect(result.warning).toContain("unconfirmed");expect(JSON.stringify(result)).not.toContain(access.token);expect(JSON.stringify(result)).not.toContain("1AB2CD3EF45");expect(m.verify).toHaveBeenCalledWith(access.locationId,access.ghlUserId,access.token);
});
