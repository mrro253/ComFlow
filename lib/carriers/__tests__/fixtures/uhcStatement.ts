import type { UhcCell,UhcPage } from "@/lib/carriers/uhc/parseUhcStatement";
export function uhcFixture():UhcPage[] {
  const c=(row:number,column:number,text:string):UhcCell=>({row,column,text});
  const page:UhcPage=[c(19,20,"Today's Date"),c(19,100,"03/21/2026"),c(39,20,"Party ID"),c(39,100,"9990001"),
    c(107,20,"For Medicare Plan Commission inquiries"),c(264,20,"Agent Writing"),c(264,110,"9990002 - EXAMPLE, ALEX - Statement Date 03/19/2026")];
  for(const [column,label] of [[20,"Member Name"],[220,"Medicare ID"],[320,"Policy Number"],[420,"Product"],[520,"Comp Type"],
    [620,"Original Effective"],[720,"Member State"],[820,"Commission Action"],[1120,"Payment Period"],[1210,"Prem Amount"],[1310,"UAD Activity"],[1410,"Commission"]] as const) page.push(c(234,column,label));
  ["12.34","45.67"].forEach((amount,i)=>{
    const row=284+i*20;
    for(const [column,text] of [[20,`SYNTHETIC CLIENT ${i+1}`],[220,`TEST-ID-${i+1}`],[320,`999100${i+1}`],[420,"TEST"],
      [620,"01/01/2026"],[720,"FL"],[820,"Renewal"],[1120,"202603"],[1210,"$0.00"],[1310,"$0.00"],[1410,`$${amount}`]] as const) page.push(c(row,column,text));
  });
  page.push(c(324,820,"Tot Amount Statement Date 03/19/2026"),c(324,1144,"TEST"),c(324,1210,"$0.00"),c(324,1310,"$0.00"),c(324,1410,"$58.01"));
  const summary:UhcPage=[c(25,20,"Summary"),c(49,20,"Party ID"),c(49,100,"9990001")];
  const cols=[[19,"Statement Date",19,"03/19/2026"],[129,"Payment Number",129,"999777"],[262,"Prior Balance",281,"$0.00"],
    [355,"Commission Activity",389,"$58.01"],[473,"Payment Amount",499,"$58.01"],[586,"Ending Balance",611,"$0.00"],
    [690,"Prior UAD Balance",721,"$0.00"],[814,"UAD Activity",831,"$0.00"],[904,"Ending UAD Balance",941,"$0.00"]] as const;
  for(const [col,label,valueCol,value] of cols)summary.push(c(133,col,label),c(153,valueCol,value));
  summary.push(c(133,1023,"Payment Reissue"));return [page,summary];
}
export const uhcText=(pages=uhcFixture())=>JSON.stringify({format:"uhc-rotated-v1",pages});

/** Synthetic PDF transport fixture; source cells contain no real client data. */
export function uhcFixturePdf(pages=uhcFixture()):Buffer {
  const escape=(s:string)=>s.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
  const objects=["<< /Type /Catalog /Pages 2 0 R >>",`<< /Type /Pages /Kids [${pages.map((_,i)=>`${4+i*2} 0 R`).join(" ")}] /Count ${pages.length} >>`,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  pages.forEach((page,i)=>{
    const content=page.map(c=>`BT /F1 9 Tf 1 0 0 1 ${c.row} ${c.column} Tm (${escape(c.text)}) Tj ET`).join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1600 1600] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+i*2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content,"latin1")} >>\nstream\n${content}\nendstream`);
  });
  let out=`%PDF-1.4\n%${"synthetic ".repeat(Buffer.poolSize)}\n`;const offsets:number[]=[];
  objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(out,"latin1"));out+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
  const xref=Buffer.byteLength(out,"latin1");out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  out+=offsets.map(n=>`${String(n).padStart(10,"0")} 00000 n \n`).join("");
  out+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(out,"latin1");
}
