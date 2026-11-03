import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { enrollmentGhlStatuses } from "../enrollmentGhlStatusRepository";
import { enrollmentLinkId } from "@/lib/crm/gohighlevel/contactLinks";
import { syntheticSunfireCollection } from "@/lib/enrollments/__fixtures__/sunfireCollection";
import type { CurrentUser } from "@/types/domain";
const m=vi.hoisted(()=>({client:vi.fn(),admin:vi.fn(),original:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:m.client}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:m.admin}));
vi.mock("../saleDispositionRepository",()=>({readAuthorizedSaleSource:m.original}));
const user={id:"actor",agencyId:"agency",active:true,role:"agent"} as CurrentUser;
const source=syntheticSunfireCollection().records[0];
const sale={ownerId:"owner",collectionHash:"a".repeat(64),code:source.code,source};
const key=`owner/${sale.code}`;
function chain(result:unknown){const q={select:vi.fn(),eq:vi.fn(),in:vi.fn(),maybeSingle:vi.fn(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};q.select.mockReturnValue(q);q.eq.mockReturnValue(q);q.in.mockReturnValue(q);q.maybeSingle.mockResolvedValue(result);return q;}
function event(overrides:Record<string,unknown>={}){return {id:enrollmentLinkId(user.agencyId,user.id,"Connection123",sale),details:{version:1,connectionId:"Connection123",locationId:"Location123",ghlUserId:"User123",ownerId:sale.ownerId,code:sale.code,collectionHash:sale.collectionHash,contactId:"Contact123",basis:"fresh_full_mbi_verified",...overrides}};}
beforeEach(()=>{vi.resetAllMocks();m.client.mockResolvedValue({from:(table:string)=>chain({data:table==="ghl_connections"?[{id:"Connection123",location_id:"Location123"}]:{ghl_user_id:"User123"},error:null})});m.admin.mockReturnValue({from:()=>chain({data:[event()],error:null})});m.original.mockResolvedValue(source);vi.stubGlobal("fetch",vi.fn());});
afterEach(()=>vi.unstubAllGlobals());
it("shows local saved links without fetching GHL contacts or returning private identifiers",async()=>{
 const statuses=await enrollmentGhlStatuses(user,[sale]);expect(statuses.get(key)).toBe("linked");expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify([...statuses])).not.toContain(source.mbi);expect(JSON.stringify([...statuses])).not.toContain("Contact123");
});
it("does not access audit records for inactive, unmapped or unconnected users",async()=>{
 await expect(enrollmentGhlStatuses({...user,active:false},[sale])).rejects.toThrow();expect(m.admin).not.toHaveBeenCalled();
 m.client.mockResolvedValueOnce({from:()=>chain({data:[],error:null})});expect((await enrollmentGhlStatuses(user,[sale])).get(key)).toBe("not_connected");expect(m.admin).not.toHaveBeenCalled();
 m.client.mockResolvedValueOnce({from:(table:string)=>chain({data:table==="ghl_connections"?[{id:"Connection123",location_id:"Location123"}]:null,error:null})});expect((await enrollmentGhlStatuses(user,[sale])).get(key)).toBe("not_assigned");expect(m.admin).not.toHaveBeenCalled();
});
it("rejects stale location/user bindings and keeps a new application separate",async()=>{
 m.admin.mockReturnValueOnce({from:()=>chain({data:[event({ghlUserId:"OtherUser"})],error:null})});expect((await enrollmentGhlStatuses(user,[sale])).get(key)).toBe("recheck");
 m.admin.mockReturnValueOnce({from:()=>chain({data:[],error:null})});expect((await enrollmentGhlStatuses(user,[{...sale,code:"DifferentApplication"}])).get("owner/DifferentApplication")).toBe("not_linked");
});
it("preserves links across recollections only when the source application evidence is unchanged",async()=>{
 m.admin.mockReturnValue({from:()=>chain({data:[event({collectionHash:"b".repeat(64)})],error:null})});expect((await enrollmentGhlStatuses(user,[sale])).get(key)).toBe("linked");
 m.original.mockResolvedValueOnce({...source,mbi:"9AB2CD3EF45"});expect((await enrollmentGhlStatuses(user,[sale])).get(key)).toBe("recheck");
 m.original.mockRejectedValueOnce(new Error("Source unavailable"));expect((await enrollmentGhlStatuses(user,[sale])).get(key)).toBe("recheck");
});
it("does not turn a failed lookup into an unlinked result",async()=>{
 m.admin.mockReturnValue({from:()=>chain({data:null,error:{message:"Unavailable"}})});await expect(enrollmentGhlStatuses(user,[sale])).rejects.toThrow();
});
