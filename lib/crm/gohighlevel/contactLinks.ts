import { digest } from "@/lib/carriers/digest";
import { fullMbi,type PreviewContact,type PreviewEnrollment } from "./contactPreview";
export interface GhlEnrollmentLink {ownerId:string;collectionHash:string;code:string;contactId:string;nameDiffers:boolean}
export function verifiedContact(enrollment:PreviewEnrollment,contacts:PreviewContact[],complete:boolean){
  const mbi=fullMbi(enrollment.mbi);if(!complete||!mbi)return null;
  const matches=contacts.filter(c=>c.mbi===mbi);
  return matches.length===1?matches[0]:null;
}
export function linkReviewHash(connectionId:string,ghlUserId:string,links:GhlEnrollmentLink[]){
  return digest({version:1,connectionId,ghlUserId,links:[...links].sort((a,b)=>`${a.ownerId}/${a.code}`.localeCompare(`${b.ownerId}/${b.code}`))});
}
export function enrollmentLinkId(agencyId:string,actorId:string,connectionId:string,link:Pick<GhlEnrollmentLink,"ownerId"|"code">){
  // Contact ID is intentionally excluded: a competing identity cannot overwrite the first link.
  const key=digest({version:1,agencyId,actorId,connectionId,ownerId:link.ownerId,code:link.code});
  return `${key.slice(0,8)}-${key.slice(8,12)}-5${key.slice(13,16)}-a${key.slice(17,20)}-${key.slice(20,32)}`;
}
