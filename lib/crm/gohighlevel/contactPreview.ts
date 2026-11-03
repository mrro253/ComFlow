import { validateSetupInput,validGhlId } from "./setupClient";

export interface PreviewContact { id:string; firstName:string; lastName:string; mbi:string|null }
export interface PreviewEnrollment { code:string; firstName:string; lastName:string; mbi:string; carrier:string; plan:string; proposedEffectiveDate:string }
export interface ContactCandidate { name:string; evidence:"Full MBI agrees"|"Name only"|"MBI differs" }
export interface ContactPreviewRow { code:string; name:string; carrier:string; plan:string; effectiveDate:string; status:"MBI agreement"|"Name candidate"|"Multiple candidates"|"Identity conflict"|"No candidate found"|"Search incomplete"; candidates:ContactCandidate[] }
const normalizeName=(s:string)=>s.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase("en-US");
export const fullMbi=(s:unknown)=>typeof s==="string"&&/^[A-Z0-9]{11}$/.test(s.replace(/[ -]/g,"").toUpperCase())?s.replace(/[ -]/g,"").toUpperCase():null;
export function compareContactCandidates(enrollment:PreviewEnrollment, contacts:PreviewContact[], complete:boolean):ContactPreviewRow {
  const name=`${enrollment.firstName} ${enrollment.lastName}`;
  const candidates=contacts.filter(c=>normalizeName(`${c.firstName} ${c.lastName}`)===normalizeName(name)).map(c=>({name:`${c.firstName} ${c.lastName}`,evidence:(!c.mbi?"Name only":c.mbi===fullMbi(enrollment.mbi)?"Full MBI agrees":"MBI differs") as ContactCandidate["evidence"]}));
  const status:ContactPreviewRow["status"]=!complete?"Search incomplete":candidates.length>1?"Multiple candidates":candidates[0]?.evidence==="Full MBI agrees"?"MBI agreement":candidates[0]?.evidence==="MBI differs"?"Identity conflict":candidates.length?"Name candidate":"No candidate found";
  return {code:enrollment.code,name,carrier:enrollment.carrier,plan:enrollment.plan,effectiveDate:enrollment.proposedEffectiveDate,status,candidates};
}
// Only fixed-host GET endpoints. Raw provider content and secrets are never returned or logged.
async function read(path:string, token:string) {
  try {
    const response=await fetch(`https://services.leadconnectorhq.com${path}`,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,Version:"2021-07-28",Accept:"application/json"}});
    if(!response.ok||Number(response.headers.get("content-length")??0)>1000000)throw new Error();
    const text=await response.text();if(text.length>1000000)throw new Error();
    const result=JSON.parse(text);if(!result||typeof result!=="object"||Array.isArray(result))throw new Error();return result as Record<string,unknown>;
  } catch {throw new Error("GHL read unavailable. Check read permissions and try again.");}
}
export async function readMbiField(locationId:string,token:string):Promise<string|null> {
  validateSetupInput(locationId,token);
  const data=await read(`/locations/${encodeURIComponent(locationId)}/customFields?model=contact`,token);
  if(!Array.isArray(data.customFields))throw new Error("Field definitions unavailable.");
  const matches=data.customFields.filter((f:Record<string,unknown>)=>f?.fieldKey==="contact.medicare_number_mbi"&&f.model==="contact"&&f.locationId===locationId&&typeof f.id==="string"&&validGhlId(f.id));
  return matches.length===1?matches[0].id:null;
}
export async function searchAssignedContacts(locationId:string,ghlUserId:string,token:string,enrollment:PreviewEnrollment,mbiField:string|null) {
  validateSetupInput(locationId,token);if(!validGhlId(ghlUserId))throw new Error("Verified GHL user required.");
  const query=new URLSearchParams({locationId,query:`${enrollment.firstName} ${enrollment.lastName}`,limit:"100"});
  const data=await read(`/contacts/?${query}`,token);
  if(!Array.isArray(data.contacts)||data.contacts.length>100)throw new Error("Contact search response unavailable.");
  const ids=new Set<string>();const contacts:PreviewContact[]=[];
  for(const raw of data.contacts) {
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new Error("Contact search response unavailable.");
    // Filter before reading names or identifiers. Never disclose another user's contacts.
    if(raw.locationId!==locationId||raw.assignedTo!==ghlUserId)continue;
    if(typeof raw.id!=="string"||!validGhlId(raw.id)||ids.has(raw.id))throw new Error("Contact search response unavailable.");ids.add(raw.id);
    if(typeof raw.firstName!=="string"||typeof raw.lastName!=="string"||raw.firstName.length>200||raw.lastName.length>200)continue;
    const fields=Array.isArray(raw.customFields)?raw.customFields.filter((f:Record<string,unknown>)=>f?.id===mbiField):[];
    contacts.push({id:raw.id,firstName:raw.firstName,lastName:raw.lastName,mbi:mbiField&&fields.length===1?fullMbi(fields[0].value):null});
  }
  // This bounded name query is not an exhaustive MBI lookup. Full pages stay visibly incomplete.
  return {contacts,complete:data.contacts.length<100&&!(typeof data.count==="number"&&data.count>data.contacts.length)};
}
