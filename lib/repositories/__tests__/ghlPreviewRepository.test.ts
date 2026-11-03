import { beforeEach,expect,it,vi } from "vitest";
import { ghlPreviewAccess } from "../ghlPreviewRepository";
const m=vi.hoisted(()=>({client:vi.fn(),admin:vi.fn(),decrypt:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:m.client}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:m.admin}));
vi.mock("@/lib/crm/gohighlevel/setupToken",()=>({decryptGhlToken:m.decrypt}));
const user={id:"actor",agencyId:"agency",role:"agent",active:true} as Parameters<typeof ghlPreviewAccess>[0];
const connection={id:"connection",agency_id:"agency",user_id:"owner",location_id:"Location123"};
function chain(result:unknown){const q={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(),single:vi.fn(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);q.maybeSingle.mockResolvedValue(result);q.single.mockResolvedValue(result);return q;}
beforeEach(()=>{vi.resetAllMocks();m.decrypt.mockReturnValue("synthetic-token");});
it("denies inactive accounts and missing self mapping before accessing credentials",async()=>{
 await expect(ghlPreviewAccess({...user,active:false})).rejects.toThrow();expect(m.admin).not.toHaveBeenCalled();
 m.client.mockResolvedValue({from:(table:string)=>chain({data:table==="ghl_connections"?[connection]:null,error:null})});
 await expect(ghlPreviewAccess(user)).rejects.toThrow();expect(m.admin).not.toHaveBeenCalled();
});
it("binds self mapping to the current agency and connection before decrypting",async()=>{
 const c=chain({data:[connection],error:null}),mapping=chain({data:{ghl_user_id:"User123"},error:null});
 m.client.mockResolvedValue({from:(table:string)=>table==="ghl_connections"?c:mapping});m.admin.mockReturnValue({from:()=>chain({data:{ciphertext:"v1.synthetic"},error:null})});
 expect(await ghlPreviewAccess(user)).toMatchObject({locationId:"Location123",ghlUserId:"User123"});
 expect(c.eq).toHaveBeenCalledWith("agency_id","agency");expect(mapping.eq).toHaveBeenCalledWith("user_id","actor");expect(mapping.eq).toHaveBeenCalledWith("connection_id","connection");
 expect(m.decrypt).toHaveBeenCalledWith("v1.synthetic",{id:"connection",agencyId:"agency",userId:"owner",locationId:"Location123"});
});
