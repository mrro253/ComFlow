import {beforeEach,expect,it,vi} from "vitest";
import {reviewPolicyOwner,savePolicyOwner,savePolicySplit} from "@/app/(dashboard)/payments/ownerActions";
const m=vi.hoisted(()=>({role:vi.fn(),rpc:vi.fn(),path:vi.fn()}));
vi.mock("@/lib/auth/requireRole",()=>({requireRole:m.role}));vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({rpc:m.rpc})}));vi.mock("next/cache",()=>({revalidatePath:m.path}));
const id="e0190000-0000-4000-8000-000000000401",target="e0140000-0000-4000-8000-000000000002";
beforeEach(()=>{vi.clearAllMocks();m.role.mockResolvedValue({id:"owner",agencyId:"agency"});m.rpc.mockResolvedValue({data:{changed:2},error:null});});
it("binds ownership changes to the authenticated agency owner and reviewed policy",async()=>{
 expect(await savePolicyOwner({entryId:id,ownerId:target,reason:"Agent wrote for colleague",reviewHash:"a".repeat(64)})).toMatchObject({ok:true,changed:2});expect(m.role).toHaveBeenCalledWith(["owner"]);
 expect(m.rpc).toHaveBeenCalledWith("save_policy_commission_owner",{p_actor:"owner",p_agency:"agency",p_entry:id,p_owner:target,p_reason:"Agent wrote for colleague",p_review_hash:"a".repeat(64)});
});
it("rejects invalid or unauthorized requests and keeps database failures closed",async()=>{
 expect(await savePolicyOwner({entryId:id,ownerId:target,reason:"",reviewHash:"a".repeat(64)})).toHaveProperty("error");expect(m.rpc).not.toHaveBeenCalled();
 m.role.mockRejectedValue(new Error("Denied"));expect(await reviewPolicyOwner(id)).toHaveProperty("error");expect(m.rpc).not.toHaveBeenCalled();
});
it("does not report success or refresh financial views for a rejected save",async()=>{
 m.rpc.mockResolvedValue({data:null,error:{}});expect(await savePolicyOwner({entryId:id,ownerId:target,reason:"Review",reviewHash:"a".repeat(64)})).toHaveProperty("error");expect(m.path).not.toHaveBeenCalled();
});

it("binds two-agent splits to the current owner and rejects duplicate recipients",async()=>{
 const input={entryId:id,first:target,second:"e0140000-0000-4000-8000-000000000003",basisPoints:3333,enabled:true,reason:"Shared policy",reviewHash:"a".repeat(64)};
 expect(await savePolicySplit({...input,second:target})).toHaveProperty("error");expect(m.rpc).not.toHaveBeenCalled();
 expect(await savePolicySplit(input)).toMatchObject({ok:true});expect(m.rpc).toHaveBeenCalledWith("save_policy_commission_split",expect.objectContaining({p_actor:"owner",p_agency:"agency",p_basis_points:3333,p_first:target}));
});
it("cannot report a split saved after denied access or database rejection",async()=>{
 const input={entryId:id,first:target,second:"e0140000-0000-4000-8000-000000000003",basisPoints:5000,enabled:true,reason:"Shared",reviewHash:"a".repeat(64)};
 m.rpc.mockResolvedValue({data:null,error:{}});expect(await savePolicySplit(input)).toHaveProperty("error");expect(m.path).not.toHaveBeenCalled();m.rpc.mockClear();m.role.mockRejectedValue(new Error("Denied"));expect(await savePolicySplit(input)).toHaveProperty("error");expect(m.rpc).not.toHaveBeenCalled();
});
