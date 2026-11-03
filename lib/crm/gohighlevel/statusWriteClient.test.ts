import { afterEach,expect,it,vi } from "vitest";
import { createStatusWriter } from "./statusWriteClient";
const token="synthetic-private-token-for-test";
afterEach(()=>vi.unstubAllGlobals());
it("writes only the verified status field and a minimal contact-specific history note",async()=>{
 const fetcher=vi.fn(async(_url:unknown,options?:RequestInit)=>{const body=JSON.parse(String(options?.body??"{}"));return new Response(JSON.stringify(options?.method==="POST"?{note:{id:"Note123",body:body.body,userId:"User123",contactId:"Contact123"}}:{succeeded:true,contact:{id:"Contact123"}}),{status:options?.method==="POST"?201:200});});vi.stubGlobal("fetch",fetcher);
 const client=createStatusWriter("Location123","User123",token,"Contact123");await client.createNote("Synthetic history");await client.setActive("StatusField123");
 expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({userId:"User123",body:"Synthetic history"});expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({customFields:[{id:"StatusField123",fieldValue:"Active"}]});expect(fetcher.mock.calls[0][0]).toBe("https://services.leadconnectorhq.com/contacts/Contact123/notes");expect(fetcher.mock.calls[1][1]).toMatchObject({method:"PUT",redirect:"error",cache:"no-store"});
});
it("requires one matching body, author and contact when reconciling an operation marker",async()=>{
 const body="History [ComFlow operation synthetic]",note={id:"Note123",body,userId:"User123",contactId:"Contact123"};const client=createStatusWriter("Location123","User123",token,"Contact123");
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({notes:[note]}))));expect(await client.findNote("[ComFlow operation synthetic]",body)).toBe("Note123");
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({notes:[note,note]}))));await expect(client.findNote("[ComFlow operation synthetic]",body)).rejects.toThrow("Multiple");
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({notes:[{...note,userId:"OtherUser"}]}))));await expect(client.findNote("[ComFlow operation synthetic]",body)).rejects.toThrow("changed");
});
it("does not retry writes or expose upstream error bodies",async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response("private provider data",{status:403}));vi.stubGlobal("fetch",fetcher);const client=createStatusWriter("Location123","User123",token,"Contact123");await expect(client.createNote("Synthetic")).rejects.toThrow("could not be confirmed");expect(fetcher).toHaveBeenCalledTimes(1);
});
