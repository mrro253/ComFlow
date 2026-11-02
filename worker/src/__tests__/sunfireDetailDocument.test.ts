import { expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { loadEnrollmentDetailDocument } from "../sunfire/detailDocument";
const target = "https://www.sunfirematrix.com/app/agent/example/#/enrollment/SF_U1lO/view";
function fixture() {
  const waitFor = vi.fn(), goto = vi.fn(), reload = vi.fn();
  const page = { goto, reload, getByText: () => ({ waitFor }) } as unknown as Page;
  return { page, waitFor, goto, reload };
}
it("reads the original detail document when it loads normally", async () => {
  const f=fixture(); await loadEnrollmentDetailDocument(f.page,target);
  expect(f.goto).toHaveBeenCalledWith(target,{waitUntil:"domcontentloaded"});
  expect(f.reload).not.toHaveBeenCalled();
});
it("forces a fresh document in the authenticated tab before accepting a form", async () => {
  const f=fixture(); await loadEnrollmentDetailDocument(f.page,target,true);
  expect(f.reload).toHaveBeenCalledWith({waitUntil:"domcontentloaded"});
  expect(f.reload.mock.invocationCallOrder[0]).toBeLessThan(f.waitFor.mock.invocationCallOrder[0]);
});
it("refreshes once after a form-load timeout and requires the form again", async () => {
  const f=fixture(); const timeout=new Error("synthetic timeout"); timeout.name="TimeoutError";
  f.waitFor.mockRejectedValueOnce(timeout).mockResolvedValueOnce(undefined);
  await loadEnrollmentDetailDocument(f.page,target);
  expect(f.reload).toHaveBeenCalledOnce(); expect(f.waitFor).toHaveBeenCalledTimes(2);
});
it("fails after the bounded retry and does not retry other errors", async () => {
  const f=fixture(); const timeout=new Error("synthetic timeout"); timeout.name="TimeoutError";
  f.waitFor.mockRejectedValue(timeout);
  await expect(loadEnrollmentDetailDocument(f.page,target)).rejects.toThrow("synthetic timeout");
  expect(f.reload).toHaveBeenCalledOnce();
  const other=fixture(); other.waitFor.mockRejectedValue(new Error("synthetic navigation error"));
  await expect(loadEnrollmentDetailDocument(other.page,target)).rejects.toThrow();
  expect(other.reload).not.toHaveBeenCalled();
});
