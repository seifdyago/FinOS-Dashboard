// FinOS WhatsApp Webhook
// Vercel Serverless Function
//
// Handles:
// 1. WhatsApp webhook verification
// 2. Incoming WhatsApp webhook events
//
// IMPORTANT:
// Put secrets in Vercel Environment Variables.
// NEVER put the WhatsApp token in this file or GitHub.

declare const process: {
  env: Record<string, string | undefined>;
};

type WhatsAppMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: {
    body?: string;
  };
};

type WhatsAppValue = {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: Array<{
    profile?: {
      name?: string;
    };
    wa_id?: string;
  }>;
  messages?: WhatsAppMessage[];
};

type WhatsAppChange = {
  field?: string;
  value?: WhatsAppValue;
};

type WhatsAppWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: WhatsAppChange[];
  }>;
};

export default async function handler(req: any, res: any) {
  /*
   * ============================================================
   * GET
   * WhatsApp uses this request when verifying the webhook.
   * ============================================================
   */

  if (req.method === "GET") {
    const mode = req.query?.["hub.mode"];
    const token = req.query?.["hub.verify_token"];
    const challenge = req.query?.["hub.challenge"];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (!verifyToken) {
      console.error("Missing WHATSAPP_VERIFY_TOKEN");

      return res.status(500).json({
        error: "WhatsApp webhook verification token is not configured.",
      });
    }

    if (
      mode === "subscribe" &&
      token === verifyToken &&
      typeof challenge === "string"
    ) {
      console.log("WhatsApp webhook verified successfully.");

      return res.status(200).send(challenge);
    }

    return res.status(403).json({
      error: "Webhook verification failed.",
    });
  }

  /*
   * ============================================================
   * POST
   * WhatsApp sends incoming messages and events here.
   * ============================================================
   */

  if (req.method === "POST") {
    try {
      const body: WhatsAppWebhookBody =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body || {};

      console.log(
        "WhatsApp webhook event:",
        JSON.stringify(body, null, 2)
      );

      /*
       * WhatsApp sends object === "whatsapp_business_account"
       * for normal Cloud API webhook events.
       */
      if (body.object !== "whatsapp_business_account") {
        return res.status(200).json({
          received: true,
          ignored: true,
        });
      }

      /*
       * Walk through all webhook entries and changes.
       */
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value;

          if (!value) {
            continue;
          }

          const messages = value.messages || [];

          for (const message of messages) {
            const customerPhone = message.from || "";
            const messageId = message.id || "";
            const messageType = message.type || "unknown";

            const customerName =
              value.contacts?.find(
                (contact) => contact.wa_id === customerPhone
              )?.profile?.name || "WhatsApp Customer";

            const text =
              message.type === "text"
                ? message.text?.body || ""
                : "";

            /*
             * This is the normalized message that the rest
             * of FinOS will use later.
             */
            const incomingMessage = {
              channel: "whatsapp",
              customer: {
                phone: customerPhone,
                name: customerName,
              },
              message: {
                id: messageId,
                type: messageType,
                text,
                timestamp: message.timestamp || null,
              },
              whatsapp: {
                phoneNumberId:
                  value.metadata?.phone_number_id || null,
                displayPhoneNumber:
                  value.metadata?.display_phone_number || null,
              },
            };

            console.log(
              "FinOS WhatsApp message:",
              JSON.stringify(incomingMessage, null, 2)
            );

            /*
             * ==================================================
             * NEXT STEP
             *
             * Here we will connect:
             *
             * WhatsApp
             *      ↓
             * Customer lookup
             *      ↓
             * Invoices / Transactions
             *      ↓
             * Gemini
             *      ↓
             * WhatsApp reply
             *
             * We intentionally leave this part separate for now
             * so the webhook can be tested safely first.
             * ==================================================
             */
          }
        }
      }

      /*
       * WhatsApp expects a successful response.
       */
      return res.status(200).json({
        received: true,
      });
    } catch (error) {
      console.error("WhatsApp webhook error:", error);

      /*
       * During testing we return 500 so the error is visible.
       */
      return res.status(500).json({
        error: "Failed to process WhatsApp webhook.",
      });
    }
  }

  /*
   * ============================================================
   * Other HTTP methods
   * ============================================================
   */

  res.setHeader("Allow", ["GET", "POST"]);

  return res.status(405).json({
    error: "Method not allowed.",
  });
}
