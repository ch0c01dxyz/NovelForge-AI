import { describe, expect, it } from "vitest";
import { studioReturnTo } from "./studioReturnTo";
describe("AI Studio return navigation", () => {
  const ws = "11111111-1111-4111-8111-111111111111", novel = "22222222-2222-4222-8222-222222222222";
  it("returns to the supplied novel inside the route workspace", () => expect(studioReturnTo(ws, novel)).toBe(`/workspaces/${ws}/novels/${novel}`));
  it.each([undefined, null, [novel], "https://example.test", "../other", "bad"])("uses home for missing or invalid novel context %s", value => expect(studioReturnTo(ws, value)).toBe("/"));
});
