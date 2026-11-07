import {beforeEach,expect,it,vi} from "vitest";
import type {Page} from "playwright";
import {createBackgroundSession,setVerificationVisible} from "../backgroundBrowser";

const mocks=vi.hoisted(()=>({launch:vi.fn()}));
vi.mock("playwright",()=>({chromium:{launch:mocks.launch}}));

function fixture(fail=false){
 const bounds=new Map<number,string>();
 const events=new Map<string,(...args:unknown[])=>void>();
 const close=vi.fn(async()=>{});
 const fronts=vi.fn(async()=>{});
 const pages:Page[]=[];
 const navigation=new Map<Page,()=>void>();
 const context={
  pages:()=>pages,
  browser:()=>browser,
  on:(name:string,callback:(...args:unknown[])=>void)=>{events.set(name,callback);},
  newCDPSession:async(page:Page)=>({send:async(method:string,input?:{windowId:number;bounds:{windowState?:string}})=>{
   const id=pages.indexOf(page)+1;
   if(method==="Browser.getWindowForTarget")return {windowId:id,bounds:{windowState:bounds.get(id)??"normal"}};
   if(method==="Browser.setWindowBounds"&&input?.bounds.windowState)bounds.set(id,input.bounds.windowState);
   if(method==="Browser.getWindowBounds")return {bounds:{windowState:fail?"normal":bounds.get(id)}};
   return {};
  }}),
  newPage:async()=>{
   const mainFrame={};
   const page={context:()=>context,isClosed:()=>false,mainFrame:()=>mainFrame,bringToFront:fronts,
    on:(name:string,callback:(arg:unknown)=>void)=>{if(name==="framenavigated")navigation.set(page as unknown as Page,()=>callback(mainFrame));},
   } as unknown as Page;
   pages.push(page);events.get("page")?.(page);return page;
  },
 };
 const browser={newContext:async()=>context,close,isConnected:()=>true};
 mocks.launch.mockResolvedValue(browser);
 return {context,bounds,close,fronts,navigation};
}
beforeEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
it("keeps hosted collection headless and refuses a full-browser verification fallback",async()=>{
 vi.stubEnv("CARRIER_BROWSER_MODE","hosted");
 const f=fixture();const {page}=await createBackgroundSession({acceptDownloads:true});
 expect(mocks.launch).toHaveBeenCalledWith({headless:true,args:[]});
 await setVerificationVisible(page,false);
 await expect(setVerificationVisible(page,true)).rejects.toThrow("Cloud verification is not available yet");
 expect(f.fronts).not.toHaveBeenCalled();expect(f.bounds.size).toBe(0);
});
it("rejects an invalid browser mode before launching",async()=>{
 vi.stubEnv("CARRIER_BROWSER_MODE","typo");
 await expect(createBackgroundSession({})).rejects.toThrow("browser mode is invalid");
 expect(mocks.launch).not.toHaveBeenCalled();
});
it("reconceals a restored collection window while leaving verification visible",async()=>{
 vi.useFakeTimers();
 try {
  const f=fixture();const {page}=await createBackgroundSession({acceptDownloads:true});
  f.bounds.set(1,"normal");
  await vi.advanceTimersByTimeAsync(500);
  expect(f.bounds.get(1)).toBe("minimized");
  await setVerificationVisible(page,true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(f.bounds.get(1)).toBe("normal");
 } finally {vi.clearAllTimers();vi.useRealTimers();}
});
it("starts the app browser minimized before navigating to a carrier",async()=>{
 const f=fixture();await createBackgroundSession({acceptDownloads:true});
 expect(mocks.launch).toHaveBeenCalledWith({headless:false,args:["--start-minimized","--window-position=-32000,-32000"]});
 expect(f.bounds.get(1)).toBe("minimized");expect(f.fronts).not.toHaveBeenCalled();
});
it("shows verification once, preserves the session, and conceals it afterward",async()=>{
 const f=fixture();const {page}=await createBackgroundSession({acceptDownloads:true});
 await setVerificationVisible(page,true);await setVerificationVisible(page,true);
 expect(f.bounds.get(1)).toBe("normal");expect(f.fronts).toHaveBeenCalledOnce();
 await setVerificationVisible(page,false);expect(f.bounds.get(1)).toBe("minimized");expect(f.close).not.toHaveBeenCalled();
});
it("keeps verification visible across code-request navigation and minimizes popups",async()=>{
 const f=fixture();const {page}=await createBackgroundSession({acceptDownloads:true});
 await setVerificationVisible(page,true);f.navigation.get(page)!();
 expect(f.bounds.get(1)).toBe("normal");
 await setVerificationVisible(page,false);expect(f.bounds.get(1)).toBe("minimized");
 const popup=await f.context.newPage();await setVerificationVisible(popup,false);expect(f.bounds.get(2)).toBe("minimized");
});
it("closes the browser if window concealment fails",async()=>{
 const f=fixture(true);await expect(createBackgroundSession({acceptDownloads:true})).rejects.toThrow("Could not start the background");expect(f.close).toHaveBeenCalled();
});
