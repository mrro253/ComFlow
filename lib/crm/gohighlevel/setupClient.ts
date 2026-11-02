/** Setup-only API: no contact endpoint or write method exists here. */
export const validGhlId=(value:string)=>/^[A-Za-z0-9]{6,80}$/.test(value);
export function validateSetupInput(locationId:string,token:string) {
  if(!validGhlId(locationId) || token.length<20 || token.length>4096 || /\s|[^\x21-\x7e]/.test(token)) throw new Error("Enter a valid Location ID and Private Integration Token.");
}
async function get(path:string,token:string):Promise<Record<string,unknown>> {
  try {
    const response=await fetch(`https://services.leadconnectorhq.com${path}`,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,Version:"2021-07-28",Accept:"application/json"}});
    if(!response.ok) throw new Error();
    // Never log/echo provider bodies, headers or request details.
    if(Number(response.headers.get("content-length")??0)>1000000) throw new Error();
    const text=await response.text(); if(text.length>1000000)throw new Error();
    const data=JSON.parse(text); if(!data || typeof data!=="object" || Array.isArray(data))throw new Error();return data;
  } catch { throw new Error("GHL could not verify access. Check the token, Location ID, read permissions, and try again."); }
}
export async function verifyGhlLocation(locationId:string,token:string) {
  validateSetupInput(locationId,token);
  const data=await get(`/locations/${encodeURIComponent(locationId)}`,token);
  const location=data.location as {id?:unknown;name?:unknown}|undefined;
  if(location?.id!==locationId || typeof location.name!=="string" || !location.name.trim() || location.name.length>200) throw new Error("GHL returned a different or incomplete location. Nothing was saved.");
  return {id:locationId,name:location.name.trim()};
}
export async function verifyGhlUser(locationId:string,userId:string,token:string) {
  validateSetupInput(locationId,token); if(!validGhlId(userId))throw new Error("Enter a valid GHL user ID.");
  const user=await get(`/users/${encodeURIComponent(userId)}`,token);
  const roles=user.roles as {locationIds?:unknown}|undefined;
  if(user.id!==userId || !Array.isArray(roles?.locationIds) || !roles.locationIds.includes(locationId))throw new Error("That GHL user could not be verified in this shared location.");
}
