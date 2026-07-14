import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFinding } from "../src/index.ts";

test("parseFinding reads an add-reaction suggestion into an addPolicy intent", () => {
  const i = parseFinding("automations", {
    message: "Purchase Order Approved has no reaction.",
    suggestion: "Add a reaction: on purchase_order_approved → then purchase_order_send_to_supplier.",
    target: "purchase_order_approved",
  });
  assert.deepEqual(i, { kind: "addPolicy", on: "purchase_order_approved", then: "purchase_order_send_to_supplier" });
});

test("parseFinding handles the ASCII arrow variant", () => {
  const i = parseFinding("automations", { message: "x", suggestion: "on offer_accepted -> then schedule_installation" });
  assert.deepEqual(i, { kind: "addPolicy", on: "offer_accepted", then: "schedule_installation" });
});

test("parseFinding reads typed attributes into an addAttribute intent", () => {
  const i = parseFinding("entities", {
    message: "Invoice has no total or issue date.",
    suggestion: "Add total:money and issuedOn:date to the Invoice entity.",
    target: "invoice",
  });
  assert.deepEqual(i, { kind: "addAttribute", entity: "invoice", attrs: [{ name: "total", type: "money" }, { name: "issuedOn", type: "date" }] });
});

test("parseFinding reads an add-reference suggestion (entity is the 'to' side)", () => {
  const i = parseFinding("entities", {
    message: "purchase_order has no supplier link.",
    suggestion: "Add a supplier reference to purchase_order.",
    target: "purchase_order",
  });
  assert.deepEqual(i, { kind: "addReference", entity: "purchase_order", to: "supplier" });
});

test("parseFinding returns null for prose it can't turn into a concrete edit", () => {
  assert.equal(parseFinding("automations", { message: "x", suggestion: "Reconsider whether this reaction should exist at all." }), null);
  assert.equal(parseFinding("entities", { message: "x", suggestion: "Think about whether Invoice is even the right aggregate." }), null);
  assert.equal(parseFinding("roles", { message: "x", suggestion: "on a → then b" }), null); // layer not handled
  assert.equal(parseFinding("automations", { message: "x", suggestion: "" }), null); // empty
});
