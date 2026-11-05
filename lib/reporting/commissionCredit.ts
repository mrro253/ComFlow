import type {CurrentUser} from "@/types/domain";
/** A preserved writer reference is attribution, not a second recipient of commission. */
export function commissionCreditRows<T extends {userId:string|null}>(user:Pick<CurrentUser,"id"|"role"|"agentType">,rows:T[]){
 return user.role==="agent"&&user.agentType!=="captive"?rows.filter(row=>row.userId===user.id):rows;
}
