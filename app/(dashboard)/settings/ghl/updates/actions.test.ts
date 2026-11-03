import { beforeEach,expect,it,vi } from "vitest";
import { previewPolicyUpdates } from "./actions";
const m=vi.hoisted(()=>({user:vi.fn(),access:vi.fn(),link:vi.fn(),sales:vi.fn(),verify:vi.fn(),fields:vi.fn(),contact:vi.fn()}));
vi.mock("@/lib/auth/requireRole",()=>({requireRole:m.user}));vi.mock("@/lib/repositories/ghlPreviewRepository",()=>({ghlPreviewAccess:m.access}));vi.mock("@/lib/repositories/ghlLinkRepository",()=>({readGhlEnrollmentLink:m.link}));vi.mock("@/lib/services/saleDispositionService",()=>({listEditableSales:m.sales}));vi.mock("@/lib/crm/gohighlevel/setupClient",()=>({verifyGhlUser:m.verify,validateSetupInput:vi.fn(),validGhlId:vi.fn()}));
vi.mock("@/lib/crm/gohighlevel/policyUpdatePreview",async(importOriginal)=>({...await importOriginal<typeof import("@/lib/crm/gohighlevel/policyUpdatePreview")>(),readPolicyFields:m.fields,readPolicyContact:m.contact}));
const source={code:"APP1",firstName:"Synthetic",lastName:"Person",carrier:"ULTIMATE HEALTH PLAN, INC.",plan:"Synthetic plan",mbi:"1AB2CD3EF45",proposedEffectiveDate:"2026-01-01",submittedDate:"2025-12-01",status:"completed",identityVerified:true,coverageConfirmed:false};
const access={connectionId:"Connection123",locationId:"Location123",ghlUserId:"User123",token:"synthetic-secret-token"};
beforeEach(()=>{vi.resetAllMocks();m.user.mockResolvedValue({id:"actor",agencyId:"agency",role:"agent",active:true});m.access.mockResolvedValue(access);m.sales.mockResolvedValue([{ownerId:"owner",collectionHash:"a".repeat(64),code:source.code,source}]);m.link.mockResolvedValue({contactId:"Contact123"});m.fields.mockResolvedValue([]);m.contact.mockResolvedValue({firstName:"Synthetic",lastName:"Person",mbi:source.mbi,values:{}});});
it("reads no contacts for unlinked enrollments and returns no private link/token/MBI fields",async()=>{
 m.link.mockResolvedValueOnce(null);const skipped=await previewPolicyUpdates();expect(skipped.skipped).toBe(1);expect(m.contact).not.toHaveBeenCalled();
 const result=await previewPolicyUpdates();expect(result.rows).toHaveLength(1);expect(JSON.stringify(result)).not.toContain(source.mbi);expect(JSON.stringify(result)).not.toContain("Contact123");expect(JSON.stringify(result)).not.toContain(access.token);
});
it("rejects lost access or changed identity and never returns a partial field preview",async()=>{
 m.access.mockRejectedValueOnce(new Error("removed"));expect(await previewPolicyUpdates()).not.toHaveProperty("rows");expect(m.contact).not.toHaveBeenCalled();
 m.contact.mockResolvedValueOnce({mbi:"9AB2CD3EF45",values:{}});expect(await previewPolicyUpdates()).not.toHaveProperty("rows");
 m.access.mockResolvedValueOnce(access).mockResolvedValueOnce({...access,ghlUserId:"ChangedUser"});expect(await previewPolicyUpdates()).not.toHaveProperty("rows");
});
it("keeps applications separate but fetches a shared contact once and flags current-policy ambiguity",async()=>{
 m.sales.mockResolvedValue([{ownerId:"owner",collectionHash:"a".repeat(64),code:"APP1",source},{ownerId:"owner",collectionHash:"a".repeat(64),code:"APP2",source:{...source,code:"APP2"}}]);
 const result=await previewPolicyUpdates();expect(result.rows).toHaveLength(2);expect(m.contact).toHaveBeenCalledTimes(1);expect(result.rows?.every(r=>r.reason.includes("Multiple applications"))).toBe(true);
});
