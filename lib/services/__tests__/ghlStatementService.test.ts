import { beforeEach,expect,it,vi } from "vitest";
import { checkStatementContacts } from "../ghlStatementService";
import type { CurrentUser } from "@/types/domain";
const m=vi.hoisted(()=>({inventory:vi.fn(),details:vi.fn(),access:vi.fn(),verify:vi.fn(),fields:vi.fn(),contact:vi.fn(),search:vi.fn(),pending:vi.fn()}));
vi.mock("@/lib/repositories/sunfireMatchRepository",()=>({loadSunfireMatchInventory:m.inventory}));
vi.mock("../paymentDetailsService",()=>({loadPaymentDetails:m.details}));
vi.mock("@/lib/repositories/ghlPreviewRepository",()=>({ghlPreviewAccess:m.access}));
vi.mock("@/lib/repositories/ghlPolicyOperationRepository",()=>({pendingPolicyOperations:m.pending}));
vi.mock("@/lib/crm/gohighlevel/setupClient",()=>({verifyGhlUser:m.verify}));
vi.mock("@/lib/crm/gohighlevel/policyUpdatePreview",()=>({readPolicyFields:m.fields,readPolicyContact:m.contact}));
vi.mock("@/lib/crm/gohighlevel/contactPreview",async original=>({...await original<typeof import("@/lib/crm/gohighlevel/contactPreview")>(),searchAssignedContacts:m.search}));
const user={id:"owner",agencyId:"agency",role:"owner",active:true} as CurrentUser;
const id="e0170000-0000-4000-8000-000000000001",code=`STMT_${id.replaceAll("-","")}`;
const entry={id,statement_id:"statement",carrier:"Ultimate Health Plans",carrier_member_id:"SyntheticMember",effective_date:"2026-03-01",statement_month:"2026-03",amount_cents:69400,commission_type:"COMMISSION",user_id:user.id};
const detail={clientName:"Example Person",statementFilename:"synthetic.pdf",fields:[{label:"First Name",value:"Example"},{label:"Last Name",value:"Person"},{label:"MBI",value:"5MK73"}]};
beforeEach(()=>{vi.resetAllMocks();m.inventory.mockResolvedValue({statements:[{id:"statement",file_hash:"a".repeat(64)}],entries:[entry]});m.details.mockResolvedValue(new Map([[id,detail]]));m.access.mockResolvedValue({connectionId:"Connection123",locationId:"Location123",ghlUserId:"User123",token:"synthetic-private-token"});m.pending.mockResolvedValue([]);m.fields.mockResolvedValue([{id:"MbiField123",key:"contact.medicare_number_mbi",name:"Medicare Number (MBI)",type:"TEXT",options:[]},{id:"DateField123",key:"contact.date",name:"Medicare Policy Effective Date",type:"DATE",options:[]},{id:"StatusField123",key:"contact.1_policy_status",name:"Medicare Policy Status",type:"SINGLE_OPTIONS",options:["Active","Unknown"]}]);m.search.mockResolvedValue({complete:true,contacts:[{id:"Contact123",firstName:"Example",lastName:"Person",mbi:"1EG4TE5MK73"}]});m.contact.mockResolvedValue({firstName:"Example",lastName:"Person",mbi:"1EG4TE5MK73",values:{DateField123:"2026-03-01",StatusField123:"Unknown"}});});
it("builds a statement-only review without a SunFire application or disclosing identifiers",async()=>{
 const result=await checkStatementContacts(user,"",code);expect(result.rows[0]).toMatchObject({status:"Contact Matched in GHL",proposal:true});expect(result.context?.plan).toMatchObject({code,sourceHash:"a".repeat(64),previousStatus:"Unknown"});expect(JSON.stringify(result.rows)).not.toContain("5MK73");expect(JSON.stringify(result.rows)).not.toContain("Contact123");
});
it("blocks conflicting partial dates, duplicate contacts and incomplete searches",async()=>{
 m.contact.mockResolvedValueOnce({firstName:"Example",lastName:"Person",mbi:"1EG4TE5MK73",values:{DateField123:"2025-01-01"}});expect((await checkStatementContacts(user)).rows[0].proposal).toBe(false);
 m.search.mockResolvedValue({complete:false,contacts:[]});expect((await checkStatementContacts(user)).rows[0].status).toBe("Search incomplete");
 m.search.mockResolvedValue({complete:true,contacts:[{id:"Contact123",firstName:"Example",lastName:"Person",mbi:"1EG4TE5MK73"},{id:"Contact456",firstName:"Example",lastName:"Person",mbi:"1EG4TE5MK73"}]});expect((await checkStatementContacts(user)).rows[0].status).toBe("Multiple matching contacts");
});
it("blocks chargebacks, missing original evidence and another credited owner",async()=>{
 m.inventory.mockResolvedValue({statements:[{id:"statement",file_hash:"a".repeat(64)}],entries:[{...entry,amount_cents:-69400,commission_type:"CHARGEBACK"}]});expect((await checkStatementContacts(user)).rows[0].proposal).toBe(false);
 m.details.mockResolvedValueOnce(new Map());await expect(checkStatementContacts(user)).rejects.toThrow("verification incomplete");
 m.inventory.mockResolvedValue({statements:[{id:"statement",file_hash:"a".repeat(64)}],entries:[{...entry,user_id:"someone-else"}]});expect((await checkStatementContacts(user)).rows[0].proposal).toBe(false);
});
it("rechecks statement and connection snapshots and exposes paused operations for safe recovery",async()=>{
 m.pending.mockResolvedValue([{source_code:code,id:"Operation123",lease_until:null}]);expect((await checkStatementContacts(user)).rows[0].pendingId).toBe("Operation123");
 m.access.mockResolvedValueOnce({connectionId:"First",locationId:"Location123",ghlUserId:"User123",token:"synthetic"});await expect(checkStatementContacts(user)).rejects.toThrow("Connection access changed");
});

it("allows a credited agent's statement update but denies another agent's credit",async()=>{
 const agent={...user,role:"agent" as const};
 expect((await checkStatementContacts(agent,"",code)).context?.plan.ownerId).toBe(agent.id);
 m.inventory.mockResolvedValue({statements:[{id:"statement",file_hash:"a".repeat(64)}],entries:[{...entry,user_id:"other-agent"}]});
 const result=await checkStatementContacts(agent,"",code);expect(result.context).toBeUndefined();expect(result.rows[0].proposal).toBe(false);
});
