import "server-only";
import { sql } from "../db";
import { env } from "../env";
import { formatKwd } from "@/lib/money";
import { readSettings } from "../platform/settings";
import { sendMail } from "../platform/mailer";

/**
 * رسائل الطلب للطالب. قاعدتان:
 * 1) تُستدعى بعد التزام المعاملة فقط، ولا ترمي أبدًا: فشل البريد لا يؤثر على الدفع أو الاسترداد.
 * 2) لها سقف زمني، حتى لا يعلق Webhook البوابة أو صفحة العودة بخادم بريد بطيء.
 * العنوان يُقرأ من حساب الطالب الحالي، لا من لقطة الطلب.
 */
const MAIL_CAP_MS = 5000;

async function guarded(label: string, work: () => Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("mail timed out")), MAIL_CAP_MS);
      }),
    ]);
  } catch (err) {
    console.error(`[mail] ${label} not sent`, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

type MailOrder = { id: string; number: string; total_fils: number; is_test: boolean; email: string; full_name: string };

async function loadOrder(orderId: string): Promise<{ order: MailOrder; site: string; link: string; tag: string } | null> {
  const [order] = await sql<MailOrder[]>`
    select o.id, o.number, o.total_fils, o.is_test, u.email, u.full_name
    from orders o join users u on u.id = o.user_id where o.id = ${orderId}
  `;
  if (!order?.email) return null;
  const settings = await readSettings();
  return {
    order,
    site: settings.site_name,
    link: `${env().APP_URL.replace(/\/$/, "")}/orders/${order.id}`,
    tag: order.is_test ? "[تجريبي] " : "",
  };
}

export function sendOrderConfirmationEmail(orderId: string): Promise<void> {
  return guarded("order confirmation", async () => {
    const data = await loadOrder(orderId);
    if (!data) return;
    const { order, site, link, tag } = data;
    const items = await sql<{ title: string }[]>`select title from order_items where order_id = ${orderId} order by created_at`;
    const list = items.map((i) => `- ${i.title}`).join("\n");
    await sendMail({
      to: order.email,
      template: "order_confirmation",
      subject: `${tag}تأكيد طلبك ${order.number}، ${site}`,
      text: `مرحبًا ${order.full_name}،\n\nاكتمل طلبك رقم ${order.number} بنجاح، وأصبحت مشترياتك في مكتبتك.\n\n${list}\n\nالإجمالي: ${formatKwd(order.total_fils)}\n\nتفاصيل الطلب والإيصال:\n${link}\n\n${site}`,
    });
  });
}

export function sendRefundEmail(orderId: string): Promise<void> {
  return guarded("refund", async () => {
    const data = await loadOrder(orderId);
    if (!data) return;
    const { order, site, link, tag } = data;
    await sendMail({
      to: order.email,
      template: "order_refund",
      subject: `${tag}استرداد طلبك ${order.number}، ${site}`,
      text: `مرحبًا ${order.full_name}،\n\nتم استرداد طلبك رقم ${order.number} بقيمة ${formatKwd(order.total_fils)}. يعود المبلغ إلى وسيلة الدفع الأصلية، ويعتمد وقت ظهوره في حسابك على بوابة الدفع والبنك.\n\nتوقف الوصول إلى منتجات هذا الطلب.\n\nتفاصيل الطلب:\n${link}\n\n${site}`,
    });
  });
}

export function sendRefundCancelledEmail(orderId: string): Promise<void> {
  return guarded("refund cancelled", async () => {
    const data = await loadOrder(orderId);
    if (!data) return;
    const { order, site, link, tag } = data;
    await sendMail({
      to: order.email,
      template: "order_refund_cancelled",
      subject: `${tag}إلغاء استرداد طلبك ${order.number}، ${site}`,
      text: `مرحبًا ${order.full_name}،\n\nألغت بوابة الدفع طلب استرداد طلبك رقم ${order.number}، فلم يُرد المبلغ. عاد طلبك مدفوعًا وعاد وصولك إلى منتجاته.\n\nتفاصيل الطلب:\n${link}\n\n${site}`,
    });
  });
}
