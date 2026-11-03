import { parseDetailsPayload,type DetailsPayload } from "./detailsWritePlan";
import { validateSetupInput,validGhlId } from "./setupClient";
import { readGhlPreviewObject } from "./contactPreview";
async function write(path:string,token:string,method:"POST"|"PUT",body:unknown){
  try{
    const response=await fetch(`https://services.leadconnectorhq.com${path}`,{method,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,Version:"2021-07-28",Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify(body)});
    if(!response.ok||Number(response.headers.get("content-length")??0)>1000000)throw new Error();
    const text=await response.text();if(text.length>1000000)throw new Error();const data=JSON.parse(text);if(!data||typeof data!=="object"||Array.isArray(data))throw new Error();return data as Record<string,unknown>;
  }catch{throw new Error("GHL write could not be confirmed. The operation is paused; do not repeat it blindly.");}
}
export function createStatusWriter(locationId:string,userId:string,token:string,contactId:string){
  validateSetupInput(locationId,token);if(!validGhlId(userId)||!validGhlId(contactId))throw new Error("Invalid write destination.");
  const path=`/contacts/${encodeURIComponent(contactId)}`;
  function noteId(note:unknown,body:string){const n=note as Record<string,unknown>|null;return n&&typeof n.id==="string"&&validGhlId(n.id)&&n.contactId===contactId&&n.userId===userId&&n.body===body?n.id:null;}
  return {
    async findNote(marker:string,body:string){
      const data=await readGhlPreviewObject(`${path}/notes`,token);if(!Array.isArray(data.notes))throw new Error("History notes unavailable.");
      const matches=data.notes.filter(n=>n&&typeof n.body==="string"&&n.body.includes(marker));
      if(matches.length>1)throw new Error("Multiple operation notes require review.");if(!matches.length)return null;
      const id=noteId(matches[0],body);if(!id)throw new Error("Operation history note changed.");return id;
    },
    async createNote(body:string){
      const data=await write(`${path}/notes`,token,"POST",{userId,body});const id=noteId(data.note,body);if(!id)throw new Error("History note creation could not be confirmed.");return id;
    },
    async setDetails(payload:DetailsPayload){
      const changes=parseDetailsPayload(payload)!.changes;
      const data=await write(path,token,"PUT",{customFields:changes.map(c=>({id:c.fieldId,fieldValue:c.target}))});
      const contact=data.contact as Record<string,unknown>|undefined;
      if(data.succeeded===false||data.succeded===false||(contact?.id!==undefined&&contact.id!==contactId))throw new Error("Policy update could not be confirmed.");
    },
    async setActive(fieldId:string){
      if(!validGhlId(fieldId))throw new Error("Verified field required.");
      const data=await write(path,token,"PUT",{customFields:[{id:fieldId,fieldValue:"Active"}]});
      const contact=data.contact as Record<string,unknown>|undefined;
      if(data.succeeded===false||data.succeded===false||(contact?.id!==undefined&&contact.id!==contactId))throw new Error("Policy update could not be confirmed.");
    },
  };
}
