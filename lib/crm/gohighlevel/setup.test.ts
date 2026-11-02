import { afterEach,beforeEach,expect,it,vi } from "vitest";
import { encryptGhlToken,decryptGhlToken } from "./setupToken";
import { verifyGhlLocation,verifyGhlUser } from "./setupClient";
const binding={id:"synthetic-connection",agencyId:"synthetic-agency",userId:"synthetic-agent",locationId:"LocationSynthetic123"};
const token="pit-synthetic-token-only-for-tests";
beforeEach(()=>vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY",Buffer.alloc(32,7).toString("base64")));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("encrypts tokens without exposing them and binds ciphertext to every ownership field",()=>{
 const value=encryptGhlToken(token,binding); expect(value).not.toContain(token);expect(decryptGhlToken(value,binding)).toBe(token);
 expect(encryptGhlToken(token,binding)).not.toBe(value);
 for(const field of ["id","agencyId","userId","locationId"] as const)expect(()=>decryptGhlToken(value,{...binding,[field]:"other"})).toThrow("could not be read");
});
it("rejects altered ciphertext and missing encryption configuration",()=>{
 expect(()=>decryptGhlToken("v1.invalid.invalid.invalid",binding)).toThrow();vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY","");expect(()=>encryptGhlToken(token,binding)).toThrow("unavailable");
});
it("verifies only the requested location with a GET and blocks redirects/cache",async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({location:{id:binding.locationId,name:"Synthetic Office"}})));vi.stubGlobal("fetch",fetcher);
 expect(await verifyGhlLocation(binding.locationId,token)).toEqual({id:binding.locationId,name:"Synthetic Office"});
 expect(fetcher).toHaveBeenCalledWith(`https://services.leadconnectorhq.com/locations/${binding.locationId}`,expect.objectContaining({method:"GET",redirect:"error",cache:"no-store"}));
 expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${token}`);
});
it("never sends tokens to arbitrary paths and fails closed on a mismatched location",async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({location:{id:"another",name:"Other"}})));vi.stubGlobal("fetch",fetcher);
 await expect(verifyGhlLocation("https://example.invalid",token)).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
 await expect(verifyGhlLocation(binding.locationId,token)).rejects.toThrow("different");
});
it("does not return raw provider errors or token content",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error(`private diagnostic ${token}`)));
 await expect(verifyGhlLocation(binding.locationId,token)).rejects.toThrow("could not verify");
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(`private ${token}`,{status:403})));
 await expect(verifyGhlLocation(binding.locationId,token)).rejects.not.toThrow(token);
});
it("verifies shared-user membership in the exact configured location",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({id:"GhlUser123",roles:{locationIds:[binding.locationId]}}))));
 await expect(verifyGhlUser(binding.locationId,"GhlUser123",token)).resolves.toBeUndefined();
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({id:"GhlUser123",roles:{locationIds:["AnotherLocation"]}}))));
 await expect(verifyGhlUser(binding.locationId,"GhlUser123",token)).rejects.toThrow("could not be verified");
});
