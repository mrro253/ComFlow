/** Connection capabilities are separate from single-PDF upload parsers. */
export function connectionCarriers(owner: boolean): string[] {
  return owner ? ["Ultimate Health Plans", "UnitedHealthcare", "Devoted Health"] : ["Ultimate Health Plans", "UnitedHealthcare"];
}
