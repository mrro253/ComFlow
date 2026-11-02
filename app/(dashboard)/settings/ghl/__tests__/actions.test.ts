import { beforeEach,expect,it,vi } from "vitest";
import { saveGhlConnection,manageGhlSetup } from "../actions";
const mock=vi.hoisted(()=>({user:vi.fn(),location:vi.fn(),remoteUser:vi.fn(),encrypt:vi.fn(),change:vi.fn(),own:vi.fn(),secret:vi.fn(),team:vi.fn()}));
vi.mock("@/lib/auth/requireRole",()=>({requireRole:mock.user}));
vi.mock("@/lib/crm/gohighlevel/setupClient",()=>({verifyGhlLocation:mock.location,verifyGhlUser:mock.remoteUser,validGhlId:(s:string)=>/^[A-Za-z0-9]{6,80}$/.test(s)}));
vi.mock("@/lib/crm/gohighlevel/setupToken",()=>({encryptGhlToken:mock.encrypt}));
vi.mock("@/lib/repositories/ghlSetupRepository",()=>({changeGhlSetup:mock.change,ownGhlConnection:mock.own,sharedGhlToken:mock.secret}));
vi.mock("@/lib/repositories/userRepository",()=>({listUsersForAgency:mock.team}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const id="ed230000-0000-4000-8000-000000000123", teammate="ed230000-0000-4000-8000-000000000124";
function form(values:Record<string,string>){const f=new FormData();for(const [k,v]of Object.entries(values))f.set(k,v);return f;}
beforeEach(()=>{vi.resetAllMocks();mock.user.mockResolvedValue({id:"actor",agencyId:"agency",role:"agent"});mock.location.mockResolvedValue({name:"Synthetic"});mock.encrypt.mockReturnValue("v1.encrypted");mock.own.mockResolvedValue({mode:"shared"});mock.team.mockResolvedValue([{id:teammate,active:true}]);mock.secret.mockResolvedValue({connection:{location_id:"Location123"},token:"synthetic-token"});});
it("uses the current agent for personal setup and stores ciphertext only",async()=>{
 const result=await saveGhlConnection({},form({mode:"personal",locationId:"Location123",token:"pit-synthetic-secret-for-test",userId:"forged",agencyId:"forged"}));
 expect(result.info).toContain("saved securely");expect(mock.change).toHaveBeenCalledWith(expect.objectContaining({id:"actor",agencyId:"agency"}),"save",expect.objectContaining({ciphertext:"v1.encrypted",mode:"personal"}));
 expect(JSON.stringify(mock.change.mock.calls)).not.toContain("pit-synthetic-secret");
});
it("rejects non-owner shared setup before remote verification",async()=>{
 expect((await saveGhlConnection({},form({mode:"shared"}))).error).toContain("owner");expect(mock.location).not.toHaveBeenCalled();expect(mock.change).not.toHaveBeenCalled();
});
it("requires authentication and leaves the previous connection on failed verification",async()=>{
 mock.user.mockRejectedValueOnce(new Error("private"));await saveGhlConnection({},form({mode:"personal"}));expect(mock.change).not.toHaveBeenCalled();
 mock.location.mockRejectedValueOnce(new Error("private provider token"));const result=await saveGhlConnection({},form({mode:"personal"}));expect(result.error).not.toContain("provider token");expect(mock.change).not.toHaveBeenCalled();
});
it("verifies the shared GHL user before saving an active teammate mapping",async()=>{
 mock.user.mockResolvedValue({id:"owner",agencyId:"agency",role:"owner"});
 const f=form({id,action:"map",userId:teammate,ghlUserId:"GhlUser123"});
 expect((await manageGhlSetup({},f)).info).toBeDefined();expect(mock.remoteUser).toHaveBeenCalledWith("Location123","GhlUser123","synthetic-token");expect(mock.change).toHaveBeenCalledWith(expect.anything(),"map",{id,userId:teammate,ghlUserId:"GhlUser123"});
});
it("refuses unavailable teammates, inaccessible connections and cross-location users",async()=>{
 mock.user.mockResolvedValue({id:"owner",agencyId:"agency",role:"owner"});mock.team.mockResolvedValueOnce([]);
 const f=form({id,action:"map",userId:teammate,ghlUserId:"GhlUser123"});await manageGhlSetup({},f);expect(mock.secret).not.toHaveBeenCalled();
 mock.own.mockRejectedValueOnce(new Error("denied"));await manageGhlSetup({},f);expect(mock.change).not.toHaveBeenCalled();
 mock.remoteUser.mockRejectedValueOnce(new Error("wrong location"));await manageGhlSetup({},f);expect(mock.change).not.toHaveBeenCalled();
});
