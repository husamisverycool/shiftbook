import { describe, expect, it } from "vitest";
import { parseCommandQuery } from "./command-query";

// GitHub command palette prefixes (decision 0038): > actions, # work records, @ people and companies, ? help.
describe("parseCommandQuery", () => {
  it("reads plain text as a search of everything", () => {
    expect(parseCommandQuery("  Marcus  ")).toEqual({ mode: "all", term: "Marcus" });
    expect(parseCommandQuery("")).toEqual({ mode: "all", term: "" });
  });

  it("reads > as actions only", () => {
    expect(parseCommandQuery(">")).toEqual({ mode: "actions", term: "" });
    expect(parseCommandQuery("> invite")).toEqual({ mode: "actions", term: "invite" });
  });

  it("reads # as invoices, job orders and assignments", () => {
    expect(parseCommandQuery("#INV-1042")).toEqual({ mode: "work", term: "INV-1042" });
  });

  it("reads @ as workers and clients", () => {
    expect(parseCommandQuery("@ prairie")).toEqual({ mode: "people", term: "prairie" });
  });

  it("reads ? alone as help, and ? inside text as text", () => {
    expect(parseCommandQuery("?")).toEqual({ mode: "help", term: "" });
    expect(parseCommandQuery("who? ")).toEqual({ mode: "all", term: "who?" });
  });
});
