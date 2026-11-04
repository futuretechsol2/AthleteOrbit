// Single serverless function that serves every /api/* route (see vercel.json rewrites).
import coach from "../server/routes/ai/coach.js";
import scoresheet from "../server/routes/ai/scoresheet.js";
import video from "../server/routes/ai/video.js";
import readiness from "../server/routes/ai/readiness.js";
import trip from "../server/routes/ai/trip.js";
import tips from "../server/routes/ai/tips.js";
import onlineScores from "../server/routes/scores/online.js";
import share, { link as shareLink } from "../server/routes/share/index.js";
import sessionClaim from "../server/routes/session/claim.js";
import health from "../server/routes/health.js";
import meetday from "../server/routes/ai/meetday.js";
import * as T from "../server/routes/tickets/index.js";
import adminListings, { connect as listingConnect, notify as listingNotify } from "../server/routes/admin/listings.js";
import cronMeetday from "../server/routes/cron/meetday.js";
import checkout from "../server/routes/billing/checkout.js";
import portal from "../server/routes/billing/portal.js";
import change from "../server/routes/billing/change.js";
import webhook from "../server/routes/billing/webhook.js";
import clubCheckout from "../server/routes/club/checkout.js";
import clubJoin from "../server/routes/club/join.js";
import clubMine from "../server/routes/club/mine.js";
import supportSend from "../server/routes/support/send.js";
import adminSupport from "../server/routes/admin/support.js";
import accountDelete from "../server/routes/account/delete.js";
import reminders from "../server/routes/cron/reminders.js";
import me from "../server/routes/me.js";
import unsubscribe from "../server/routes/unsubscribe.js";
import family from "../server/routes/ai/family.js";
import calendar, { link as calendarLink } from "../server/routes/family/calendar.js";
import news from "../server/routes/family/news.js";
import announce from "../server/routes/club/announce.js";
import authUsername from "../server/routes/auth/username.js";
import authLogin from "../server/routes/auth/login.js";
import forgotUsername from "../server/routes/auth/forgot-username.js";
import adminStats from "../server/routes/admin/stats.js";

export const ROUTES = {
  "ai/coach": coach, "ai/scoresheet": scoresheet, "ai/video": video, "ai/readiness": readiness, "ai/trip": trip, "ai/tips": tips, "scores/online": onlineScores, share, "share/link": shareLink, "session/claim": sessionClaim, health, "ai/meetday": meetday, "tickets/listing": T.listing, "tickets/search": T.search, "tickets/checkout": T.checkout, "tickets/order": T.order, "tickets/paid": T.paid, "tickets/mine": T.mine, "tickets/door": T.door, "tickets/checkin": T.checkin, "admin/listings": adminListings, "admin/listing-connect": listingConnect, "admin/listing-notify": listingNotify, "cron/meetday": cronMeetday,
  "billing/checkout": checkout, "billing/portal": portal, "billing/change": change, "billing/webhook": webhook,
  "club/checkout": clubCheckout, "club/join": clubJoin, "club/mine": clubMine,
  "support/send": supportSend, "admin/support": adminSupport, "account/delete": accountDelete,
  "cron/reminders": reminders, me, unsubscribe,
  "ai/family": family, calendar, "calendar-link": calendarLink, news, "club/announce": announce,
  "auth/username": authUsername, "auth/login": authLogin, "auth/forgot-username": forgotUsername, "admin/stats": adminStats,
};

// Raw body is needed for the Stripe webhook signature; JSON is parsed by each route.
export const config = { api: { bodyParser: false } };

export default async function router(req, res) {
  const url = new URL(req.url || "/", "http://local");
  const path = (url.searchParams.get("path") || url.pathname.replace(/^\/api\/?/, "")).replace(/^\/+|\/+$/g, "");
  const fn = ROUTES[path];
  if (!fn) { res.statusCode = 404; res.setHeader("Content-Type", "application/json"); return res.end('{"error":"Not found"}'); }
  return fn(req, res);
}
