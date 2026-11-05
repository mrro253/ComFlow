import {expect,it} from "vitest";
import {commissionCreditRows} from "../commissionCredit";
const rows=[{userId:"agent2",writingUserId:"agent1"},{userId:"agent1",writingUserId:null}];
it("counts commission for its recipient rather than the preserved writer",()=>{
 expect(commissionCreditRows({id:"agent1",role:"agent",agentType:"independent"},rows)).toEqual([rows[1]]);
 expect(commissionCreditRows({id:"agent2",role:"agent",agentType:"career"},rows)).toEqual([rows[0]]);
 expect(commissionCreditRows({id:"owner",role:"owner",agentType:"independent"},rows)).toEqual(rows);
 expect(commissionCreditRows({id:"agent1",role:"agent",agentType:"captive"},rows)).toEqual(rows);
});
