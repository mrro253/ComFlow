// The package's index.js runs a debug routine when it is not required from a
// parent module (which breaks bundlers), so we import the library file directly.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdf from "pdf-parse";
  export default pdf;
}
