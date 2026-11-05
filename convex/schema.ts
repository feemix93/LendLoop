import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const loanStatus = v.union(v.literal("requested"), v.literal("approved"), v.literal("declined"), v.literal("returned"));

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("admin"), v.literal("user")),
    trusted: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
    status: v.union(v.literal("available"), v.literal("on_loan")),
  }).index("by_owner", ["ownerId"]),

  loans: defineTable({
    toolId: v.id("tools"),
    ownerId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(),
    status: loanStatus,
  })
    .index("by_owner", ["ownerId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_tool", ["toolId"])
    .index("by_status", ["status"]),

  // Idempotent reminder log: one row per (loan, day)
  reminders: defineTable({
    loanId: v.id("loans"),
    key: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    channel: v.string(),
    at: v.number(),
  }).index("by_key", ["key"]),

  // Outgoing webhook delivery log (visible failures)
  automationEvents: defineTable({
    loanId: v.id("loans"),
    event: v.string(),
    status: v.union(v.literal("sent"), v.literal("failed")),
    attempts: v.number(),
    at: v.number(),
  }),
});
