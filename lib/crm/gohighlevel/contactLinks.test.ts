import { expect,it } from "vitest";
import { enrollmentLinkId,linkReviewHash,verifiedContact } from "./contactLinks";
const source={code:"APP1",firstName:"Test",lastName:"Person",mbi:"1AB2CD3EF45",carrier:"Synthetic",plan:"Synthetic",proposedEffectiveDate:"2026-01-01"};
const contact={id:"Contact123",firstName:"Test",lastName:"Person",mbi:source.mbi};
const link={ownerId:"owner",collectionHash:"a".repeat(64),code:"APP1",contactId:"Contact123",nameDiffers:false};
it("refuses partial, conflicting, duplicate or incomplete identity evidence",()=>{
 expect(verifiedContact(source,[contact],true)?.id).toBe(contact.id);
 expect(verifiedContact(source,[contact],false)).toBeNull();
 expect(verifiedContact(source,[contact,{...contact,id:"Contact456"}],true)).toBeNull();
 expect(verifiedContact(source,[{...contact,mbi:null}],true)).toBeNull();
 expect(verifiedContact({...source,mbi:"***EF45"},[contact],true)).toBeNull();
});
it("keeps new applications separate and binds reviews to exact contacts and configuration",()=>{
 expect(enrollmentLinkId("agency","actor","connection",link)).not.toBe(enrollmentLinkId("agency","actor","connection",{...link,code:"APP2"}));
 const changedContact={...link,contactId:"OtherContact"};
 expect(enrollmentLinkId("agency","actor","connection",link)).toBe(enrollmentLinkId("agency","actor","connection",changedContact));
 expect(linkReviewHash("connection","user",[link])).not.toBe(linkReviewHash("connection","user",[{...link,contactId:"OtherContact"}]));
 expect(linkReviewHash("connection","user",[link])).not.toBe(linkReviewHash("OtherConnection","user",[link]));
});
