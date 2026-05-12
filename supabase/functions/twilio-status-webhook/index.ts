// Twilio Status Callback webhook
// Receives delivery status + error codes from Twilio for outbound SMS.
// Configure in Twilio: Messaging > Settings > Status Callback URL =
//   https://<project>.supabase.co/functions/v1/twilio-status-webhook
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-twilio-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  // Twilio signature: HMAC-SHA1(authToken, url + sorted(key+value pairs))
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const k of sortedKeys) data += k + params[k];
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  return expected === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("Missing Supabase env vars");
      return new Response("Server misconfigured", { status: 500, headers: corsHeaders });
    }

    // Parse Twilio's application/x-www-form-urlencoded payload
    const rawBody = await req.text();
    const formParams = new URLSearchParams(rawBody);
    const params: Record<string, string> = {};
    for (const [k, v] of formParams.entries()) params[k] = v;

    // MANDATORY signature validation — refuse to process if token not set
    if (!TWILIO_AUTH_TOKEN) {
      console.error("TWILIO_AUTH_TOKEN not set — refusing to accept webhook");
      return new Response("Webhook not configured", { status: 500, headers: corsHeaders });
    }
    const signature = req.headers.get("x-twilio-signature") ?? "";
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    const url = `${proto}://${host}${new URL(req.url).pathname}`;
    const valid = verifyTwilioSignature(TWILIO_AUTH_TOKEN, signature, url, params);
    if (!valid) {
      console.error("Invalid Twilio signature", { url, signature });
      return new Response("Invalid signature", { status: 403, headers: corsHeaders });
    }

    const messageSid = params["MessageSid"] ?? params["SmsSid"] ?? "";
    if (!messageSid) {
      return new Response("Missing MessageSid", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await supabase.from("twilio_message_events").insert({
      message_sid: messageSid,
      message_status: params["MessageStatus"] ?? params["SmsStatus"] ?? null,
      error_code: params["ErrorCode"] ?? null,
      error_message: params["ErrorMessage"] ?? null,
      to_number: params["To"] ?? null,
      from_number: params["From"] ?? null,
      account_sid: params["AccountSid"] ?? null,
      raw_payload: params,
    });

    if (error) {
      console.error("DB insert error", error);
      return new Response("DB error", { status: 500, headers: corsHeaders });
    }

    console.log("Twilio event stored", {
      sid: messageSid,
      status: params["MessageStatus"],
      errorCode: params["ErrorCode"] ?? null,
    });

    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Internal error", { status: 500, headers: corsHeaders });
  }
});
