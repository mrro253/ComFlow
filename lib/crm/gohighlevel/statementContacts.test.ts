import { afterEach,expect,it,vi } from "vitest";
import { decideStatementContact,verifiedStatementBridge,createStatementContact,readContactDirectory,type DirectoryContact } from "./statementContacts";
import type { CommissionEvidence } from "@/lib/enrollments/commissionMatches";
const e={carrier:"Ultimate Health Plans",firstName:"Example",lastName:"Person",clientName:"Example Person",medicareId:"5MK73",effectiveDate:"2026-03-01"} as CommissionEvidence;
const c:DirectoryContact={id:"Contact123",firstName:"Example",lastName:"Person",assignedTo:"User123",mbi:"1EG4TE5MK73",source:"",values:{DateField123:"2026-03-01"}};
afterEach(()=>vi.unstubAllGlobals());
it("links only verified contacts and holds missing identifiers, date conflicts, other agents and duplicates",()=>{
 expect(decideStatementContact(e,[c],"User123","DateField123").kind).toBe("link");
 for(const directory of [[{...c,mbi:null}],[{...c,assignedTo:"OtherUser"}],[c,{...c,id:"OtherContact"}],[{...c,values:{}}],[{...c,values:{DateField123:"2026-03-01invalid"}}]])expect(decideStatementContact(e,directory,"User123","DateField123").kind).toBe("blocked");
 expect(decideStatementContact(e,[],"User123","DateField123").kind).toBe("create");expect(decideStatementContact({...e,medicareId:""},[],"User123","DateField123").kind).toBe("blocked");
});
it("does not create over aliases or same MBI under another name",()=>{
 expect(decideStatementContact(e,[{...c,firstName:"Ex"}],"User123","DateField123").kind).toBe("blocked");
 expect(decideStatementContact({...e,medicareId:c.mbi!},[{...c,firstName:"Different"}],"User123","DateField123").kind).toBe("link");
});
it("creates only a name, mapped assignment and recovery source; never puts a partial MBI in custom fields",async()=>{
 const fetcher=vi.fn(async(_url:unknown,options?:RequestInit)=>{const b=JSON.parse(String(options?.body));return new Response(JSON.stringify({contact:{...b,id:"NewContact123"}}),{status:201});});vi.stubGlobal("fetch",fetcher);
 const operation="e0180000-0000-4000-8000-000000000001";
 expect(await createStatementContact("Location123","User123","synthetic-private-token",e,"MbiField123",operation)).toBe("NewContact123");
 const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));expect(body).toEqual({locationId:"Location123",assignedTo:"User123",firstName:"Example",lastName:"Person",source:`ComFlow statement contact ${operation}`});expect(body).not.toHaveProperty("email");expect(body).not.toHaveProperty("phone");
});
it("does not retry an unconfirmed contact POST",async()=>{
 const fetcher=vi.fn().mockRejectedValue(new Error("lost response"));vi.stubGlobal("fetch",fetcher);await expect(createStatementContact("Location123","User123","synthetic-private-token",e,"MbiField123","e0180000-0000-4000-8000-000000000001")).rejects.toThrow("could not be confirmed");expect(fetcher).toHaveBeenCalledTimes(1);
});
it("fails closed when a directory page cannot be proven complete",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({contacts:[],count:3}))));await expect(readContactDirectory("Location123","synthetic-private-token","MbiField123")).rejects.toThrow("incomplete");
});

it("uses the mapped agent's unique verified contact without touching another agent's duplicate",()=>{
 expect(decideStatementContact(e,[c,{...c,id:"OtherContact",assignedTo:"OtherUser"}],"User123","DateField123").kind).toBe("link");
 expect(decideStatementContact(e,[c,{...c,id:"SameUserDuplicate"}],"User123","DateField123").kind).toBe("blocked");
 expect(decideStatementContact(e,[c,{...c,id:"NameOnlyOther",mbi:null}],"User123","DateField123").kind).toBe("link");
});

it("uses a prior verified full-MBI link only when original statement identity, carrier and application date all agree",()=>{
 const bridge={name:"EXAMPLEPERSON",carrier:e.carrier,date:e.effectiveDate,mbi:c.mbi!,contactId:c.id};
 expect(verifiedStatementBridge(e,[{...c,values:{}}],"User123",[bridge])).toBe(c.id);
 for(const changed of [{...bridge,date:"2025-01-01"},{...bridge,carrier:"Other"},{...bridge,name:"OTHERPERSON"},{...bridge,mbi:"9AB2CD3EF45"}])expect(verifiedStatementBridge(e,[c],"User123",[changed])).toBeNull();
 expect(verifiedStatementBridge(e,[{...c,assignedTo:"OtherUser"}],"User123",[bridge])).toBeNull();
 expect(verifiedStatementBridge(e,[c,{...c,id:"Duplicate123"}],"User123",[bridge,{...bridge,contactId:"Duplicate123"}])).toBeNull();
});
