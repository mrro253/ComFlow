import type {CurrentUser} from "@/types/domain";
import type {CommissionAllocation} from "./commissionSplit";
type CreditRow={userId:string|null;amountCents?:number;hasCommissionSplit?:boolean;allocations?:CommissionAllocation[];carrierAmountCents?:number};
/** Project recipient credit without changing the preserved carrier entry. RLS scopes shares first. */
export function commissionCreditRows<T extends CreditRow>(user:Pick<CurrentUser,"id"|"role"|"agentType">,rows:T[],recipient?:string):(T & {carrierAmountCents?:number})[]{
 return rows.flatMap(row=>{
  if(row.hasCommissionSplit){
   const target=recipient&&recipient!=="all"?recipient:user.role==="agent"&&user.agentType!=="captive"?user.id:null;
   if(user.role==="owner"&&!target)return [row];
   if(user.role==="agent"&&user.agentType==="captive")return [];
   const shares=(row.allocations??[]).filter(a=>!target||a.userId===target);
   if(!shares.length)return [];
   return [{...row,userId:target??row.userId,carrierAmountCents:row.carrierAmountCents??row.amountCents,amountCents:shares.reduce((s,a)=>s+a.amountCents,0),allocations:shares}];
  }
  return user.role==="agent"&&user.agentType!=="captive"&&row.userId!==user.id?[]:[row];
 });
}
