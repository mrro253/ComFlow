import { DEVOTED_COLUMNS } from "../parseDevotedPair";
export function syntheticPair() {
  return {
    pdfHash: "a".repeat(64), workbookHash: "b".repeat(64),
    detail: [[...DEVOTED_COLUMNS], ["09/25/2026", "999000001", "ALEX SYNTHETIC", "SYNTH-M001", "SYNTH-MBI001", "SAM", "EXAMPLE", "FL", "11/28/2023", "01/01/2024", null, "H9999", "052", "MAPD", "4", "Renewal - Monthly", "Sep", "28.91", "0", "28.91", "SYNTHETIC FMO", null]],
    summary: [["Description", "Member Count", "Total", null, "Payee", "Payment Date"], ["Credits", "1", "$28.91", null, "ALEX SYNTHETIC", "09/25/2026"], ["Debits", "0", "$0.00"], ["Miscellaneous", "0", "$0.00"], ["Bonus", null, "$0.00"], ["Sub Total", "1", "$28.91"], ["Balance", null, "$0.00"], ["TOTAL", null, "$28.91"]],
    pdfText: ["Commission Payment Statement", "ALEX SYNTHETIC", "Sep 25, 2026", "Payment Period", "09/05/2026 - 09/11/2026", "Description Member Count Total", "Credits 1 $28.91", "Debits 0 $0.00", "Bonus $0.00", "Miscellaneous Payments 0 $0.00", "Balance Adjustment $0.00", "TOTAL 1 $28.91", "Agent MBI Member Effective Contract Amount Period Type Disenroll Cancel", "ALEX SYNTHETIC SYNTH-MBI001 SAM 01-01-24 H9999 $28.91 Sep 26 Renewal - No", "999000001 EXAMPLE Monthly"].join("\n"),
  };
}
