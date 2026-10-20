"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/session";
import { businessReplyTo } from "@/lib/services/messaging";
import { transportFromEnv } from "@/lib/services/transports";
import {
  EMAIL_SENDERS, disconnectEmailSender, emailAuthorizeUrl, saveSmtpSettings, senderTransport, setEmailSender, verifySmtp,
  type EmailSender, type OAuthEmailProvider,
} from "@/lib/services/email";

const PAGE = "/integrations/email";
const msg = (e: unknown) => encodeURIComponent(e instanceof Error ? e.message : "Something went wrong");
const done = (q: string): never => { revalidatePath(PAGE); redirect(`${PAGE}?${q}`); };

export async function chooseSenderAction(sender: EmailSender) {
  const user = await requireUser("edit_settings");
  if (!EMAIL_SENDERS.includes(sender)) throw new Error("Unknown sending method");
  if (sender !== "platform" && !(await senderTransport(user.accountId, sender))) done(`error=${encodeURIComponent("Connect that sending method first")}`);
  await setEmailSender(user.accountId, sender);
  done(`result=${sender}`);
}

export async function saveSmtpAction(f: FormData) {
  const user = await requireUser("edit_settings");
  let error: string | null = null;
  try {
    const { cfg, password } = await saveSmtpSettings(user.accountId, {
      host: String(f.get("host") ?? ""), port: String(f.get("port") || 587) as unknown as number,
      user: String(f.get("user") ?? ""), password: String(f.get("password") ?? ""),
      startTls: f.get("startTls") === "on", fromAddress: String(f.get("fromAddress") ?? ""),
      minIntervalSeconds: String(f.get("minIntervalSeconds") || 0) as unknown as number,
    });
    try {
      await verifySmtp(cfg, password);
      await setEmailSender(user.accountId, "smtp");
    } catch (e) {
      error = `Saved, but the server did not accept the connection: ${e instanceof Error ? e.message : "unknown error"}. Email is still sent the previous way.`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Something went wrong";
  }
  if (error) done(`error=${encodeURIComponent(error)}`);
  done("result=smtp");
}

export async function connectOAuthAction(provider: OAuthEmailProvider) {
  const user = await requireUser("edit_settings");
  if (provider !== "gmail" && provider !== "outlook") throw new Error("Unknown provider");
  let url: string;
  try {
    url = emailAuthorizeUrl(user.accountId, provider);
  } catch (e) {
    redirect(`${PAGE}?error=${msg(e)}`);
  }
  redirect(url);
}

export async function disconnectSenderAction(sender: Exclude<EmailSender, "platform">) {
  const user = await requireUser("edit_settings");
  if (!["smtp", "gmail", "outlook"].includes(sender)) throw new Error("Unknown sending method");
  await disconnectEmailSender(user.accountId, sender);
  done(`result=disconnected`);
}

/** Send a test message through the account's current sender (no fallback) to the logged-in user. */
export async function sendTestEmailAction() {
  const user = await requireUser("edit_settings");
  const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, user.accountId) });
  const sender = account?.settings.emailSender ?? "platform";
  let error: string | null = null;
  try {
    const t = sender === "platform" ? { transport: transportFromEnv() } : await senderTransport(user.accountId, sender);
    if (!t) throw new Error("That sending method is not connected");
    await t.transport.send({
      channel: "email", to: user.email, from: account?.businessName ?? "Rounds",
      replyTo: await businessReplyTo(user.accountId, account?.settings.email),
      subject: `Test email from ${account?.businessName ?? "Rounds"}`,
      body: "This is a test message. If you can read it, your email settings are working.",
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "The test email could not be sent";
  }
  if (error) done(`error=${encodeURIComponent(`Test failed: ${error}`)}`);
  done(`result=test&to=${encodeURIComponent(user.email)}`);
}
