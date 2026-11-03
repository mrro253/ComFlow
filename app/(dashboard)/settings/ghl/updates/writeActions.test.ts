import { beforeEach,expect,it,vi } from "vitest";
import { reviewStatusUpdate,sendReviewedStatusUpdate } from "./writeActions";
const m=vi.hoisted(()=>({user:vi.fn(),prepare:vi.fn(),resume:vi.fn(),send:vi.fn()}));
vi.mock("@/lib/auth/requireRole",()=>({requireRole:m.user}));vi.mock("@/lib/services/ghlStatusWriteService",()=>({prepareStatusWriteReview:m.prepare,resumeStatusWriteReview:m.resume,sendStatusWrite:m.send}));
beforeEach(()=>{vi.resetAllMocks();m.user.mockResolvedValue({id:"actor",agencyId:"agency",role:"owner"});m.send.mockResolvedValue({changed:true});});
it("requires explicit approval and a reviewed hash before entering the write service",async()=>{
 expect((await sendReviewedStatusUpdate("operation","a".repeat(64),false)).error).toContain("approve");expect(m.send).not.toHaveBeenCalled();
 expect((await sendReviewedStatusUpdate("operation","bad",true)).error).toBeDefined();expect(m.user).not.toHaveBeenCalled();
});
it("uses the signed-in actor and does not echo provider data on failures",async()=>{
 await sendReviewedStatusUpdate("operation","a".repeat(64),true);expect(m.send).toHaveBeenCalledWith({id:"actor",agencyId:"agency",role:"owner"},"operation","a".repeat(64));
 m.send.mockRejectedValueOnce(new Error("private provider token"));expect(JSON.stringify(await sendReviewedStatusUpdate("operation","a".repeat(64),true))).not.toContain("private provider");
 m.user.mockRejectedValueOnce(new Error("signed out"));await reviewStatusUpdate("APP1");expect(m.prepare).not.toHaveBeenCalled();
});
