import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verify } from "./lib/hmac";
import { isDate, today } from "./lib/validate";

const http = httpRouter();

async function authorized(req: Request, body: string) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;
  return verify(secret, req.headers.get("x-lendloop-timestamp"), body, req.headers.get("x-lendloop-signature"));
}

// n8n -> Convex: overdue loans (signature over `${timestamp}.` with empty body)
http.route({
  path: "/overdue",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!(await authorized(req, ""))) return new Response("Unauthorized", { status: 401 });
    const loans = await ctx.runQuery(internal.loans.overdue, { today: today() });
    return Response.json({ loans });
  }),
});

// n8n -> Convex: reminder write-back (idempotent)
http.route({
  path: "/reminder-result",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const raw = await req.text();
    if (!(await authorized(req, raw))) return new Response("Unauthorized", { status: 401 });
    try {
      const b = JSON.parse(raw);
      if (typeof b.loanId !== "string" || !isDate(b.date) || !["sent", "failed"].includes(b.status) || typeof b.channel !== "string") {
        return new Response("Bad request", { status: 400 });
      }
      const result = await ctx.runMutation(internal.reminders.record, { loanId: b.loanId, date: b.date, status: b.status, channel: b.channel.slice(0, 20) });
      return Response.json(result);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
  }),
});

export default http;
